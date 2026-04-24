# Hearth Backlog

## Future Architecture

**T6-1 — Migrate frontend to Next.js**
Priority: Low (post-validation)
Trigger: When 5–10 vendors are live and the model is proven

Context:
The current stack (static HTML/JS + Supabase + Netlify) is appropriate for the validation phase but has a natural ceiling. As platform complexity grows — more interactive UI, shared components, complex state, Stripe webhooks, notification flows — raw HTML/JS becomes harder to maintain and slower to build in.

Migration target: Next.js + Supabase + Netlify (or Vercel)
- Supabase layer (schema, RLS, views, edge functions) remains unchanged
- Front end rebuilt as a component-based React app
- Netlify supports Next.js natively, so no infrastructure change required
- Claude Code prompt quality improves significantly on React/Next.js codebase

Recommended approach:
- Do not migrate prematurely — finish Stripe (T3-8), SMTP, and first live drops first
- When trigger is met, engage a technical co-founder or short freelance engagement (2–4 weeks) to scaffold the Next.js app and migrate core pages
- Resume Claude Code-driven iteration on the new foundations

No code changes required. Documentation only.
