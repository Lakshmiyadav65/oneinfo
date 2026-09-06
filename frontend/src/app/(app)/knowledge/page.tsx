"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { useAsyncData } from "@/hooks/useAsyncData";
import { deleteKnowledge, listKnowledge } from "@/lib/api/knowledge";
import { AddKnowledgeDialog } from "@/components/knowledge/AddKnowledgeDialog";
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
  const [dialogOpen, setDialogOpen] = useState(false);

  const items = knowledge.status === "success" ? knowledge.data : [];
  const hasProcessing = items.some((item) => item.status === "processing");

  // Ingestion (extract, chunk, embed) runs in the background after the
  // request returns, so a freshly added document lands here as "processing".
  // Poll only while something is actually in flight.
  const { retry } = knowledge;
  useEffect(() => {
    if (!hasProcessing) return;
    const timer = setInterval(retry, 3000);
    return () => clearInterval(timer);
  }, [hasProcessing, retry]);

  async function handleDelete(id: string, title: string) {
    try {
      await deleteKnowledge(id);
      toast({ title: "Removed", description: `"${title}" is no longer used.` });
      knowledge.retry();
    } catch {
      toast({ title: "Couldn't remove that", description: "Please try again." });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Your Knowledge</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The content you add here will help OneInfo create content in your style.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          Add Knowledge
        </Button>
      </div>

      <AddKnowledgeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={knowledge.retry}
      />

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
          description="Paste a chat or upload a document so OneInfo can create content in your style."
          action={<Button onClick={() => setDialogOpen(true)}>Add Knowledge</Button>}
        />
      )}

      {knowledge.status === "success" && knowledge.data.length > 0 && (
        <div className="space-y-2">
          {knowledge.data.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs uppercase text-muted-foreground">{item.source_type}</p>
                  {item.status === "failed" && item.error_message && (
                    <p className="mt-1 text-xs text-destructive">{item.error_message}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={STATUS_VARIANT[item.status]}>{item.status}</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void handleDelete(item.id, item.title)}
                    aria-label={`Remove ${item.title}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
