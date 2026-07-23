"use client";

import { BookOpen, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const PAYLOAD_EXAMPLE = `{
  "event": "lead.captured",
  "data": {
    "email": "player@example.com",
    "gameId": "0e6e2f2a-....-uuid",
    "prizeTier": "tier_1",
    "sourceDomain": "yourclient.com",
    "timestamp": "2026-07-22T21:00:00.000Z"
  }
}`;

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px] text-zinc-700">
      {children}
    </code>
  );
}

type TutorialStep = { title: string; body: ReactNode };

type Tutorial = {
  id: string;
  name: string;
  summary: string;
  steps: TutorialStep[];
};

const TUTORIALS: Tutorial[] = [
  {
    id: "zapier",
    name: "Zapier",
    summary: "No-code automation — route leads into 6,000+ apps.",
    steps: [
      {
        title: "Create a “Catch Hook” trigger",
        body: (
          <>
            In Zapier, create a new Zap and choose{" "}
            <span className="font-medium text-zinc-700">Webhooks by Zapier</span>{" "}
            as the trigger, then select the{" "}
            <span className="font-medium text-zinc-700">Catch Hook</span> event.
            Zapier generates a unique inbound URL.
          </>
        ),
      },
      {
        title: "Copy the URL into this dashboard",
        body: (
          <>
            Paste the generated Catch Hook URL into the{" "}
            <span className="font-medium text-zinc-700">Webhook URL</span> field
            above and click <span className="font-medium text-zinc-700">Save URL</span>,
            then press <span className="font-medium text-zinc-700">Send Test Payload</span>{" "}
            so Zapier can capture a sample.
          </>
        ),
      },
      {
        title: "Map the payload to your CRM",
        body: (
          <>
            Add an action step (e.g. HubSpot, Mailchimp, Google Sheets) and map
            the incoming fields — <Code>data.email</Code>, <Code>data.gameId</Code>,
            and <Code>data.prizeTier</Code> — to the matching fields in your
            destination.
          </>
        ),
      },
    ],
  },
  {
    id: "make",
    name: "Make.com (Integromat)",
    summary: "Visual scenario builder with auto data-structure detection.",
    steps: [
      {
        title: "Add a “Custom Webhook” module",
        body: (
          <>
            Create a new scenario, add the{" "}
            <span className="font-medium text-zinc-700">Webhooks</span> module and
            choose <span className="font-medium text-zinc-700">Custom webhook</span>.
            Add a new webhook and copy the address Make generates.
          </>
        ),
      },
      {
        title: "Copy the URL and save it here",
        body: (
          <>
            Paste that address into the{" "}
            <span className="font-medium text-zinc-700">Webhook URL</span> field
            above and save it.
          </>
        ),
      },
      {
        title: "Determine data structure",
        body: (
          <>
            Click{" "}
            <span className="font-medium text-zinc-700">
              Determine data structure
            </span>{" "}
            in Make, then hit <span className="font-medium text-zinc-700">Send Test Payload</span>{" "}
            here. Make auto-detects the JSON schema so downstream modules can
            reference <Code>email</Code>, <Code>gameId</Code>, and{" "}
            <Code>prizeTier</Code> directly.
          </>
        ),
      },
    ],
  },
  {
    id: "klaviyo",
    name: "Klaviyo",
    summary: "Email & SMS — relay leads into profiles and events.",
    steps: [
      {
        title: "Klaviyo has no native inbound webhook",
        body: (
          <>
            Klaviyo cannot receive an arbitrary POST directly, so route the lead
            through a connector or a small relay.
          </>
        ),
      },
      {
        title: "Option A — via Zapier / Make",
        body: (
          <>
            Point this webhook at Zapier or Make (see above) and add a{" "}
            <span className="font-medium text-zinc-700">Klaviyo</span> action to
            create/update a profile and record a{" "}
            <span className="font-medium text-zinc-700">Custom Metric</span>.
          </>
        ),
      },
      {
        title: "Option B — via the Klaviyo API",
        body: (
          <>
            Host a tiny serverless relay that verifies our signature, then calls
            Klaviyo&apos;s{" "}
            <span className="font-medium text-zinc-700">Track / Events API</span>.
            Map <Code>email</Code> to the profile identifier and pass{" "}
            <Code>prizeTier</Code> and <Code>gameId</Code> as event properties.
          </>
        ),
      },
    ],
  },
  {
    id: "hubspot",
    name: "HubSpot",
    summary: "Create or update contacts from captured leads.",
    steps: [
      {
        title: "Choose a connection path",
        body: (
          <>
            Use Zapier/Make with a{" "}
            <span className="font-medium text-zinc-700">HubSpot</span> action, or a
            serverless relay calling the HubSpot CRM API.
          </>
        ),
      },
      {
        title: "Upsert the contact",
        body: (
          <>
            Use <Code>data.email</Code> as the unique identifier to create or
            update the contact, and store <Code>prizeTier</Code> / <Code>gameId</Code>{" "}
            as custom properties for segmentation.
          </>
        ),
      },
    ],
  },
  {
    id: "shopify",
    name: "Shopify",
    summary: "Tag customers and build marketing audiences.",
    steps: [
      {
        title: "Receive the lead",
        body: (
          <>
            Use a Shopify Flow{" "}
            <span className="font-medium text-zinc-700">Send HTTP request</span>{" "}
            step in reverse via a relay, or (simplest) route the webhook through
            Zapier/Make which has a native{" "}
            <span className="font-medium text-zinc-700">Shopify</span> connector.
          </>
        ),
      },
      {
        title: "Create or tag the customer",
        body: (
          <>
            Create a customer / marketing contact from <Code>data.email</Code> and
            apply a tag derived from <Code>prizeTier</Code> (e.g.{" "}
            <Code>game-winner-tier_1</Code>) to power discounts and flows.
          </>
        ),
      },
    ],
  },
  {
    id: "wordpress",
    name: "WordPress / WooCommerce",
    summary: "Receive leads via REST endpoint or a webhook plugin.",
    steps: [
      {
        title: "Register a REST endpoint",
        body: (
          <>
            Add a custom route with{" "}
            <Code>register_rest_route()</Code> that accepts a{" "}
            <span className="font-medium text-zinc-700">POST</span>, or install a
            plugin such as{" "}
            <span className="font-medium text-zinc-700">WP Webhooks</span> /{" "}
            <span className="font-medium text-zinc-700">WPForms</span> to capture
            it without code.
          </>
        ),
      },
      {
        title: "Store or forward the lead",
        body: (
          <>
            Persist <Code>email</Code>, <Code>gameId</Code>, and{" "}
            <Code>prizeTier</Code> as a WooCommerce customer/order note or forward
            them to your mailing list. Always verify the signature first (see
            below).
          </>
        ),
      },
    ],
  },
  {
    id: "sheets",
    name: "Google Sheets",
    summary: "Lightweight lead tracking in a spreadsheet.",
    steps: [
      {
        title: "Pick a receiver",
        body: (
          <>
            Use Zapier/Make with a{" "}
            <span className="font-medium text-zinc-700">Google Sheets</span> “Create
            row” action, or deploy a Google{" "}
            <span className="font-medium text-zinc-700">Apps Script Web App</span>{" "}
            (<Code>doPost(e)</Code>) as the webhook target.
          </>
        ),
      },
      {
        title: "Append a row per lead",
        body: (
          <>
            Write one row per captured lead with columns for <Code>email</Code>,{" "}
            <Code>gameId</Code>, <Code>prizeTier</Code>, and <Code>timestamp</Code>.
          </>
        ),
      },
    ],
  },
  {
    id: "n8n",
    name: "n8n",
    summary: "Self-hosted, open-source workflow automation.",
    steps: [
      {
        title: "Add a Webhook node",
        body: (
          <>
            Create a workflow starting with the{" "}
            <span className="font-medium text-zinc-700">Webhook</span> node and copy
            its <span className="font-medium text-zinc-700">Production URL</span>.
          </>
        ),
      },
      {
        title: "Save the URL and branch",
        body: (
          <>
            Paste the URL above and save. From the Webhook node, branch to any
            downstream integration (CRM, database, email) using the incoming{" "}
            <Code>email</Code>, <Code>gameId</Code>, and <Code>prizeTier</Code>.
          </>
        ),
      },
    ],
  },
  {
    id: "custom",
    name: "Custom CRM / HTTPS endpoint",
    summary: "Full control — receive and verify the signed payload yourself.",
    steps: [
      {
        title: "Expose an HTTPS POST endpoint",
        body: (
          <>
            Stand up a dedicated{" "}
            <span className="font-medium text-zinc-700">HTTPS</span> endpoint that
            accepts a <Code>POST</Code> with a JSON body. Save its URL above.
          </>
        ),
      },
      {
        title: "Verify the HMAC signature",
        body: (
          <>
            Read the{" "}
            <Code>X-MashedGames-Signature: sha256=&lt;hex&gt;</Code> header, compute{" "}
            <span className="font-medium text-zinc-700">HMAC-SHA256</span> over the{" "}
            <span className="font-medium text-zinc-700">raw request body</span> using
            your Webhook Secret, and compare with a constant-time check. Reject any
            request whose signature does not match.
          </>
        ),
      },
      {
        title: "Process the lead",
        body: (
          <>
            Once verified, read <Code>data.email</Code>, <Code>data.gameId</Code>,
            and <Code>data.prizeTier</Code> and write them into your system.
          </>
        ),
      },
    ],
  },
];

export function WebhookHelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-1"
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden />
          Integration Guide
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Webhook Integration Guide</DialogTitle>
          <DialogDescription>
            Connect captured leads to your marketing stack in minutes.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-5 space-y-6">
          <section className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-zinc-900">How it works</p>
              <p className="text-sm leading-relaxed text-zinc-500">
                When a player submits their details, Mashed Games sends an HTTP{" "}
                <Code>POST</Code> request to your configured Webhook URL in real
                time. The JSON payload carries the lead data — including the
                player&apos;s <Code>email</Code>, the <Code>gameId</Code>, and the{" "}
                <Code>prizeTier</Code> they won — so it lands directly in your CRM
                or automation tool.
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
              <ShieldCheck
                className="mt-px h-4 w-4 shrink-0 text-emerald-600"
                aria-hidden
              />
              <p className="text-sm leading-relaxed text-emerald-800">
                Every request is signed with{" "}
                <span className="font-semibold">HMAC SHA-256</span> using your
                game&apos;s Webhook Secret. Verify the{" "}
                <code className="rounded bg-emerald-100 px-1 py-0.5 font-mono text-[11px] text-emerald-900">
                  X-MashedGames-Signature: sha256=&lt;hex&gt;
                </code>{" "}
                header against the raw request body before trusting a payload.
              </p>
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-zinc-900">Example payload</p>
              <pre className="overflow-x-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-[11px] leading-relaxed text-zinc-700">
                <code>{PAYLOAD_EXAMPLE}</code>
              </pre>
            </div>
          </section>

          <section className="space-y-2">
            <div>
              <p className="text-sm font-medium text-zinc-900">
                Step-by-step tutorials
              </p>
              <p className="text-xs text-zinc-500">
                Pick your destination system to see how to connect it.
              </p>
            </div>

            <Accordion
              type="single"
              collapsible
              className="rounded-xl border border-zinc-200"
            >
              {TUTORIALS.map((tutorial) => (
                <AccordionItem
                  key={tutorial.id}
                  value={tutorial.id}
                  className="px-4"
                >
                  <AccordionTrigger>
                    <span className="flex flex-col gap-0.5">
                      <span>{tutorial.name}</span>
                      <span className="text-xs font-normal text-zinc-400">
                        {tutorial.summary}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ol className="space-y-3">
                      {tutorial.steps.map((step, index) => (
                        <li key={step.title} className="flex gap-3">
                          <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-semibold text-zinc-600">
                            {index + 1}
                          </span>
                          <div className="space-y-0.5">
                            <p className="text-sm font-medium text-zinc-800">
                              {step.title}
                            </p>
                            <p className="text-sm leading-relaxed text-zinc-500">
                              {step.body}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
