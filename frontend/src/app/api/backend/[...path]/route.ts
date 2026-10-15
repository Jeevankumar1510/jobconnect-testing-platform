import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function forward(request: NextRequest, context: RouteContext) {
  const baseUrl = (
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    ""
  )
    .trim()
    .replace(/\/+$/, "");

  if (!baseUrl) {
    return Response.json(
      { detail: "The API_BASE_URL server setting is not configured." },
      { status: 503 },
    );
  }

  const { path } = await context.params;
  const pathname = path.map(encodeURIComponent).join("/");
  const target = `${baseUrl}/${pathname}${request.nextUrl.search}`;
  const headers = new Headers();
  for (const name of ["accept", "authorization", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
    });

    if (!upstream.ok && upstream.status >= 502 && upstream.status <= 504) {
      const contentType = upstream.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        return Response.json(
          {
            detail:
              "The Render backend service is currently waking up from sleep. Please wait 15–30 seconds and click Try Again.",
          },
          { status: 503 },
        );
      }
    }

    const responseHeaders = new Headers();
    for (const name of ["content-type", "content-disposition"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown connection error";
    console.error(`JobConnect API proxy request to ${target} failed:`, message);
    return Response.json(
      {
        detail: `Could not connect to the JobConnect API at ${baseUrl}. It may be starting up or the URL is incorrect. (${message})`,
      },
      { status: 502 },
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
