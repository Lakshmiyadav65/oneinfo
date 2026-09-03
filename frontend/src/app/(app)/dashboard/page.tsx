"use client";

import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useAsyncData } from "@/hooks/useAsyncData";
import { listProjects } from "@/lib/api/projects";
import { listKnowledge } from "@/lib/api/knowledge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Badge } from "@/components/ui/Badge";

export default function DashboardPage() {
  const { creator } = useAuth();
  const projects = useAsyncData(listProjects);
  const knowledge = useAsyncData(listKnowledge);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Welcome back{creator?.name ? `, ${creator.name}` : ""}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn an idea into a finished video.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              Create your next video
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Turn an idea into a finished video with hooks, script, and storyboard.
            </p>
          </div>
          <Button asChild>
            <Link href="/create">
              <Plus className="size-4" />
              Create Video
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Knowledge items</p>
            {knowledge.status === "loading" && <Skeleton className="mt-2 h-8 w-16" />}
            {knowledge.status === "error" && (
              <p className="mt-2 text-sm text-destructive">{knowledge.message}</p>
            )}
            {knowledge.status === "success" && (
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {knowledge.data.length}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <p className="text-sm text-muted-foreground">Total projects</p>
            {projects.status === "loading" && <Skeleton className="mt-2 h-8 w-16" />}
            {projects.status === "error" && (
              <p className="mt-2 text-sm text-destructive">{projects.message}</p>
            )}
            {projects.status === "success" && (
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {projects.data.length}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Recent Projects</h3>

        {projects.status === "loading" && (
          <div className="space-y-2">
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
            description="Create your first video and it will appear here."
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
                    <span className="text-sm font-medium text-foreground">
                      {project.title}
                    </span>
                    <Badge variant={project.status === "completed" ? "success" : "default"}>
                      {project.status}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
