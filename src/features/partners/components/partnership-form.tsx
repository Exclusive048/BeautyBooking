"use client";

import Link from "next/link";
import { type FormEvent, useId, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UI_TEXT } from "@/lib/ui/text";

const T = UI_TEXT.partners.form;

const PARTNERSHIP_KINDS = [
  "school",
  "brand",
  "media",
  "community",
  "tech",
  "other",
] as const;
type PartnershipKind = (typeof PARTNERSHIP_KINDS)[number];

type FieldErrors = Partial<{
  kind: string;
  organizationName: string;
  contactName: string;
  email: string;
  description: string;
  consent: string;
}>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PartnershipForm() {
  const consentId = useId();
  const honeypotId = useId();

  const [kind, setKind] = useState<PartnershipKind | "">("");
  const [organizationName, setOrganizationName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [telegram, setTelegram] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [genericError, setGenericError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function validate(): FieldErrors {
    const next: FieldErrors = {};
    if (!kind) next.kind = T.kind.error;
    if (organizationName.trim().length < 2) next.organizationName = T.organizationName.error;
    if (contactName.trim().length < 2) next.contactName = T.contactName.error;
    if (!EMAIL_RE.test(email.trim())) next.email = T.email.error;
    if (description.trim().length < 30) next.description = T.description.error;
    if (!consent) next.consent = T.consent.error;
    return next;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setGenericError(null);

    const fieldErrors = validate();
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/support/partnership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          organizationName: organizationName.trim(),
          contactName: contactName.trim(),
          email: email.trim(),
          telegram: telegram.trim() || null,
          website: website.trim() || null,
          description: description.trim(),
          consent: true,
          honeypot,
        }),
      });

      if (!res.ok) {
        throw new Error("send_failed");
      }
      setSubmitted(true);
    } catch {
      setGenericError(T.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/50 p-8 text-center sm:p-10">
        <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
          <Check className="h-6 w-6" aria-hidden />
        </span>
        <h3 className="mb-2 font-display text-2xl text-text-main">{T.success.title}</h3>
        <p className="mx-auto max-w-lg leading-relaxed text-text-sec">
          {T.success.description}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {/* Honeypot — visible to bots, hidden from real users.
          Position-absolute off-screen + aria-hidden + tabIndex -1. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-0 w-0 overflow-hidden opacity-0"
        style={{ left: "-9999px" }}
      >
        <label htmlFor={honeypotId}>Leave this field empty</label>
        <input
          id={honeypotId}
          type="text"
          name="company_url"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <Field label={T.kind.label} error={errors.kind}>
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as PartnershipKind | "")}
          required
        >
          <option value="" disabled>
            {T.kind.placeholder}
          </option>
          {PARTNERSHIP_KINDS.map((k) => (
            <option key={k} value={k}>
              {T.kind.options[k]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={T.organizationName.label} error={errors.organizationName}>
        <Input
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
          placeholder={T.organizationName.placeholder}
          maxLength={160}
          autoComplete="organization"
          required
        />
      </Field>

      <Field label={T.contactName.label} error={errors.contactName}>
        <Input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder={T.contactName.placeholder}
          maxLength={120}
          autoComplete="name"
          required
        />
      </Field>

      <div className="grid gap-5 md:grid-cols-2">
        <Field label={T.email.label} error={errors.email}>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={T.email.placeholder}
            maxLength={200}
            autoComplete="email"
            required
          />
        </Field>
        <Field
          label={
            <>
              {T.telegram.label}{" "}
              <span className="font-normal text-text-sec">{T.optional}</span>
            </>
          }
        >
          <Input
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            placeholder={T.telegram.placeholder}
            maxLength={80}
          />
        </Field>
      </div>

      <Field
        label={
          <>
            {T.website.label}{" "}
            <span className="font-normal text-text-sec">{T.optional}</span>
          </>
        }
      >
        <Input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder={T.website.placeholder}
          maxLength={300}
        />
      </Field>

      <Field label={T.description.label} error={errors.description}>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={T.description.placeholder}
          rows={6}
          maxLength={2000}
          required
        />
      </Field>

      <div className="space-y-1">
        <label
          htmlFor={consentId}
          className="flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed text-text-sec"
        >
          <input
            id={consentId}
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-primary"
            required
          />
          <span>
            {T.consent.before}
            <Link
              href="/privacy"
              className="text-primary underline-offset-2 hover:underline"
            >
              {T.consent.link}
            </Link>
            {T.consent.after}
          </span>
        </label>
        {errors.consent ? (
          <p className="text-sm text-red-600 dark:text-red-400">{errors.consent}</p>
        ) : null}
      </div>

      {genericError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-300/60 bg-red-50 p-3 text-sm text-red-900 dark:border-red-400/40 dark:bg-red-950/40 dark:text-red-200"
        >
          {genericError}
        </div>
      ) : null}

      <Button type="submit" variant="primary" size="lg" disabled={submitting}>
        {submitting ? T.submitting : T.submit}
      </Button>
    </form>
  );
}

type FieldProps = {
  label: React.ReactNode;
  error?: string;
  children: React.ReactNode;
};

function Field({ label, error, children }: FieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-text-main">{label}</label>
      {children}
      {error ? (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
