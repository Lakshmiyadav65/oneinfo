"use client";

import Link from "next/link";
import { useAsyncData } from "@/hooks/useAsyncData";
import { getProject } from "@/lib/api/projects";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { nextStepForStatus } from "@/lib/workflow/steps";

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const project = useAsyncData(() => getProject(projectId), [projectId]);

  if (project.status === "loading") {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (project.status === "error") {
    return <ErrorState description={project.message} onRetry={project.retry} />;
  }

  if (!project.data) {
    return (
      <EmptyState
        title="Project details will appear here"
        description="This project isn't available yet."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">{project.data.title}</h2>
        <Badge>{project.data.status}</Badge>
      </div>
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground">{project.data.idea}</p>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button asChild>
          <Link href={`/create/${projectId}/${nextStepForStatus(project.data.status)}`}>
            Continue
          </Link>
        </Button>
      </div>
    </div>
  );
}
