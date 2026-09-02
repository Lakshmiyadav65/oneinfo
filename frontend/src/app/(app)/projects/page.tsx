"use client";

import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { useAsyncData } from "@/hooks/useAsyncData";
import { listProjects } from "@/lib/api/projects";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Badge } from "@/components/ui/Badge";

const STATUS_VARIANT = {
  draft: "default",
  processing: "default",
  ready: "success",
  failed: "destructive",
} as const;

export default function ProjectsPage() {
  const projects = useAsyncData(listProjects);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-foreground">Projects</h2>
        <Button asChild>
          <Link href="/create">Create Video</Link>
        </Button>
      </div>

      {projects.status === "loading" && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {projects.status === "error" && (
        <ErrorState description={projects.message} onRetry={projects.retry} />
      )}

      {projects.status === "success" && projects.data.length === 0 && (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          action={
            <Button asChild size="sm">
              <Link href="/create">Create Video</Link>
            </Button>
          }
        />
      )}

      {projects.status === "success" && projects.data.length > 0 && (
        <div className="space-y-2">
          {projects.data.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">{project.title}</p>
                    <p className="text-xs text-muted-foreground">
                      Updated {new Date(project.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={STATUS_VARIANT[project.status]}>{project.status}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
