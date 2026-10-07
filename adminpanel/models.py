from django.db import models


class PortalUser(models.Model):
    id = models.AutoField(primary_key=True)
    email = models.EmailField(max_length=320)
    role = models.CharField(max_length=20)
    created_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = "users"
        verbose_name = "portal user"
        verbose_name_plural = "portal users"

    def __str__(self) -> str:
        return self.email


class JobPosting(models.Model):
    id = models.AutoField(primary_key=True)
    recruiter_id = models.IntegerField()
    title = models.CharField(max_length=150)
    company = models.CharField(max_length=150)
    location = models.CharField(max_length=150)
    description = models.TextField()
    employment_type = models.CharField(max_length=20)
    salary_min = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    salary_max = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=20)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        managed = False
        db_table = "jobs"
        verbose_name = "job posting"
        verbose_name_plural = "job postings"

    def __str__(self) -> str:
        return self.title


class JobApplication(models.Model):
    id = models.AutoField(primary_key=True)
    job_id = models.IntegerField()
    candidate_id = models.IntegerField()
    status = models.CharField(max_length=20)
    cover_letter = models.TextField(null=True, blank=True)
    resume_filename = models.CharField(max_length=255)
    resume_content_type = models.CharField(max_length=100)
    created_at = models.DateTimeField()
    updated_at = models.DateTimeField()

    class Meta:
        managed = False
        db_table = "applications"
        verbose_name = "job application"
        verbose_name_plural = "job applications"

    def __str__(self) -> str:
        return f"Application {self.id}"
