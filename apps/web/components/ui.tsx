"use client";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import React from "react";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({ className, variant = "primary", size = "md", loading, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "h-8 px-3 text-xs",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-sm",
        variant === "primary" && "brand-gradient text-white shadow-[0_8px_30px_-12px_rgba(124,92,255,.7)] hover:opacity-95",
        variant === "secondary" && "border border-line bg-surface-2 text-fg hover:bg-[#1d2027]",
        variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-fg",
        variant === "danger" && "bg-red-500/15 text-red-300 hover:bg-red-500/25",
        className,
      )}
    >
      {loading && <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("rounded-2xl border border-line bg-surface", className)}>{children}</div>;
}
export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-11 w-full rounded-xl border border-line bg-surface-2 px-3.5 text-sm text-fg outline-none placeholder:text-muted/60 focus:border-brand/60 focus:ring-2 focus:ring-brand/20",
        className,
      )}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-xl border border-line bg-surface-2 p-3.5 text-sm text-fg outline-none placeholder:text-muted/60 focus:border-brand/60 focus:ring-2 focus:ring-brand/20",
        className,
      )}
    />
  );
}

export function Label({ className, children }: { className?: string; children: React.ReactNode }) {
  return <label className={cn("mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted", className)}>{children}</label>;
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "brand" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "border-line bg-surface-2 text-muted",
        tone === "good" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        tone === "warn" && "border-amber-500/30 bg-amber-500/10 text-amber-300",
        tone === "bad" && "border-red-500/30 bg-red-500/10 text-red-300",
        tone === "brand" && "border-brand/40 bg-brand/10 text-[#c4b5fd]",
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block size-4 animate-spin rounded-full border-2 border-white/20 border-t-white/80", className)} />;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-14 text-center">
      <div className="text-base font-semibold">{title}</div>
      {body && <div className="max-w-md text-sm text-muted">{body}</div>}
      {action}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="h-full rounded-full brand-gradient transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
