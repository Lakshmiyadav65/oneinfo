"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";

type ToastVariant = "default" | "success" | "destructive";

type ToastMessage = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toast: (input: Omit<ToastMessage, "id" | "variant"> & { variant?: ToastVariant }) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const variantStyles: Record<ToastVariant, string> = {
  default: "border-border bg-card text-card-foreground",
  success: "border-success/20 bg-card text-card-foreground",
  destructive: "border-destructive/20 bg-card text-card-foreground",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);

  const toast = useCallback<ToastContextValue["toast"]>(
    ({ title, description, variant = "default" }) => {
      const id = crypto.randomUUID();
      setMessages((prev) => [...prev, { id, title, description, variant }]);
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {messages.map((message) => (
          <ToastPrimitive.Root
            key={message.id}
            duration={5000}
            onOpenChange={(open) => {
              if (!open) dismiss(message.id);
            }}
            className={cn(
              "rounded-md border px-4 py-3 shadow-md data-[state=open]:animate-none",
              variantStyles[message.variant]
            )}
          >
            <ToastPrimitive.Title className="text-sm font-medium">
              {message.title}
            </ToastPrimitive.Title>
            {message.description && (
              <ToastPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                {message.description}
              </ToastPrimitive.Description>
            )}
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
