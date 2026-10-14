from django.core.management.base import BaseCommand
from config.database import SessionLocal
from jobs.services.external_jobs import sync_external_postings


class Command(BaseCommand):
    help = "Sync authentic live jobs from external platforms (Remotive, RemoteOK, Jobicy, Arbeitnow, WeWorkRemotely)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--limit",
            type=int,
            default=35,
            help="Maximum postings to fetch per source (default: 35)",
        )
        parser.add_argument(
            "--purge-placeholders",
            action="store_true",
            default=True,
            help="Purge placeholder fake test jobs before syncing",
        )

    def handle(self, *args, **options):
        limit = options.get("limit", 35)
        purge = options.get("purge_placeholders", True)
        self.stdout.write(f"Syncing up to {limit} real jobs per platform (purge_placeholders={purge})...")

        with SessionLocal() as db:
            result = sync_external_postings(db, limit_per_source=limit, purge_placeholders=purge)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Successfully synced: {result['imported']} imported, {result['updated']} updated."
                )
            )
            for source, counts in result.get("sources", {}).items():
                self.stdout.write(f"  - {source}: {counts['imported']} new, {counts['updated']} updated")
