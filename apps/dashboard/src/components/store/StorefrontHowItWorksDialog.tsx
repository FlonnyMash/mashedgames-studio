"use client";

import { HelpCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const STEPS = [
  {
    title: "Select Template",
    description: "Choose a game mechanic that fits your campaign.",
  },
  {
    title: "Configure",
    description: "Adapt visuals and parameters in the engine.",
  },
  {
    title: "Launch",
    description: "Publish and embed the game instantly.",
  },
] as const;

export function StorefrontHowItWorksDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="How it works"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
        >
          <HelpCircle className="h-4 w-4" aria-hidden />
        </button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>How it works</DialogTitle>
        </DialogHeader>

        <ol className="mt-6 space-y-5">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex items-start gap-4">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-50 text-xs font-medium tabular-nums text-zinc-500">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium text-zinc-900">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-500">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  );
}
