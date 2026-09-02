"use client";

import { BookOpen, Plus } from "lucide-react";
import { useAsyncData } from "@/hooks/useAsyncData";
import { listKnowledge } from "@/lib/api/knowledge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";

const STATUS_VARIANT = {
  processing: "default",
  ready: "success",
  failed: "destructive",
} as const;

export default function KnowledgePage() {
  const { toast } = useToast();
  const knowledge = useAsyncData(listKnowledge);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Your Knowledge</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The content you add here will help OneInfo create content in your style.
          </p>
        </div>
        <Button
          onClick={() =>
            toast({
              title: "Not available yet",
              description: "Knowledge upload lands in a later build.",
            })
          }
        >
          <Plus className="size-4" />
          Add Knowledge
        </Button>
      </div>

      {knowledge.status === "loading" && (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {knowledge.status === "error" && (
        <ErrorState description={knowledge.message} onRetry={knowledge.retry} />
      )}

      {knowledge.status === "success" && knowledge.data.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title="No knowledge added yet"
          description="Add documents or notes so OneInfo can create content in your style."
        />
      )}

      {knowledge.status === "success" && knowledge.data.length > 0 && (
        <div className="space-y-2">
          {knowledge.data.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs uppercase text-muted-foreground">{item.type}</p>
                </div>
                <Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
