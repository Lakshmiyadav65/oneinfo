"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { useAsyncData } from "@/hooks/useAsyncData";
import { deleteKnowledge, listKnowledge } from "@/lib/api/knowledge";
import { AddKnowledgeDialog } from "@/components/knowledge/AddKnowledgeDialog";
import { KnowledgeViewerDialog } from "@/components/knowledge/KnowledgeViewerDialog";
import { EnvironmentSetupLibrary } from "@/components/knowledge/EnvironmentSetupLibrary";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import type { KnowledgeItem } from "@/types/knowledge";

const STATUS_VARIANT = {
  processing: "default",
  ready: "success",
  failed: "destructive",
} as const;

// What the row calls each kind of source. "reel"/"video" would read as
// storage formats; what a creator recognises is that these are the ones
// that came from something they said out loud.
const SOURCE_LABEL: Record<KnowledgeItem["source_type"], string> = {
  pdf: "PDF",
  docx: "DOCX",
  txt: "TXT",
  text: "Text",
  reel: "Transcribed reel",
  video: "Transcribed video",
};

export default function KnowledgePage() {
  const { toast } = useToast();
  const knowledge = useAsyncData(listKnowledge);
  const [dialogOpen, setDialogOpen] = useState(false);
  // The row being read, or null. Holding the item rather than just its id so
  // the dialog can show the title and status straight away, while the
  // content it has to fetch is still on its way.
  const [viewing, setViewing] = useState<KnowledgeItem | null>(null);

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
            Paste a chat, upload a file, or add reels you have already posted.
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

      <KnowledgeViewerDialog
        item={viewing}
        onOpenChange={(open) => !open && setViewing(null)}
        onChanged={knowledge.retry}
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
          description="Paste a chat, upload a document, or add your own reels — OneInfo transcribes them and writes from what you already say."
          action={<Button onClick={() => setDialogOpen(true)}>Add Knowledge</Button>}
        />
      )}

      {knowledge.status === "success" && knowledge.data.length > 0 && (
        <div className="space-y-2">
          {knowledge.data.map((item) => (
            <Card key={item.id} className="relative transition-colors hover:border-ring">
              {/*
                An overlay rather than wrapping the row in a button: the row
                already contains a link and a delete control, and nesting
                those inside a button is invalid markup that keyboard and
                screen-reader users pay for. This sits behind them, so a
                click anywhere else opens the document.
              */}
              <button
                type="button"
                onClick={() => setViewing(item)}
                aria-label={`Open ${item.title}`}
                className="absolute inset-0 z-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <CardContent className="pointer-events-none flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {SOURCE_LABEL[item.source_type] ?? item.source_type}
                  </p>
                  {/*
                    The link, for anything transcribed off the web. A reel is
                    named after its caption once it has been read, and the
                    caption alone is not enough to tell two of them apart.
                  */}
                  {item.source_url && (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="pointer-events-auto relative z-10 mt-0.5 block truncate text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      {item.source_url}
                    </a>
                  )}
                  {item.status === "failed" && item.error_message && (
                    <p className="mt-1 text-xs text-destructive">{item.error_message}</p>
                  )}
                </div>
                <div className="pointer-events-auto relative z-10 flex shrink-0 items-center gap-2">
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

      {/*
        Below the documents, not beside them. Both are the creator's own
        reusable material, but a setup is picked and applied while a document
        is read by the agents - mixing them into one list would suggest they
        do the same job.
      */}
      <EnvironmentSetupLibrary />
    </div>
  );
}
