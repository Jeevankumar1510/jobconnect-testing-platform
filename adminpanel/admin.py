from django.contrib import admin
from django.http import HttpRequest

from adminpanel.models import JobApplication, JobPosting, PortalUser


@admin.register(PortalUser)
class PortalUserAdmin(admin.ModelAdmin):
    list_display = ("id", "email", "role", "created_at")
    list_filter = ("role",)
    search_fields = ("email",)
    readonly_fields = ("id", "email", "role", "created_at")

    def has_add_permission(self, _request: HttpRequest) -> bool:
        del _request
        return False

    def has_delete_permission(
        self,
        _request: HttpRequest,
        _obj: PortalUser | None = None,
    ) -> bool:
        del _request, _obj
        return False


@admin.register(JobPosting)
class JobPostingAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "title",
        "company",
        "recruiter_id",
        "location",
        "employment_type",
        "status",
        "created_at",
    )
    list_filter = ("status", "employment_type", "location")
    search_fields = ("title", "company", "location", "description")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(JobApplication)
class JobApplicationAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "job_id",
        "candidate_id",
        "status",
        "resume_filename",
        "created_at",
    )
    list_filter = ("status",)
    search_fields = ("resume_filename", "cover_letter")
    readonly_fields = tuple(
        field.name for field in JobApplication._meta.fields
    )

    def has_add_permission(self, _request: HttpRequest) -> bool:
        del _request
        return False

    def has_change_permission(
        self,
        _request: HttpRequest,
        _obj: JobApplication | None = None,
    ) -> bool:
        del _request, _obj
        return False

    def has_delete_permission(
        self,
        _request: HttpRequest,
        _obj: JobApplication | None = None,
    ) -> bool:
        del _request, _obj
        return False
