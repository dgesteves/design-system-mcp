---
'onsystem': patch
---

Every change to the linter is now checked against a real-world corpus: 10 public repositories pinned by commit (Documenso, Dub, Cal.com, openstatus, Twenty, midday, Vercel's chatbot, shadcn/ui's website, Next.js SaaS Starter and React Aria's Tailwind starter), with findings counted per rule and a hand-labelled sample whose false-positive rate is published with each release. Nothing changes in the package itself.
