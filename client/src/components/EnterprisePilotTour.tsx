import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, CircleX, Compass, ExternalLink, ShieldCheck } from "lucide-react";
import "../enterprise-pilot-tour.css";

export const ENTERPRISE_PILOT_TOUR_STEPS = [
  { title: "Assign accountable owners", detail: "Create department teams and invite the administrators, operators, and reviewers who will own each agent’s controls.", destination: "/team", destinationLabel: "Open team management" },
  { title: "Register the first agent", detail: "Create a tenant-bound agent identity, choose its runtime, and define the narrow initial tool action it needs to perform.", destination: "/integrations", destinationLabel: "Open agent onboarding" },
  { title: "Review the policy before promotion", detail: "Use field-level policy diffs and independent review to confirm the proposed tool, action, data sensitivity, and destination constraints.", destination: "/policy-governance", destinationLabel: "Open policy governance" },
  { title: "Connect credentials safely", detail: "Configure only safe connection metadata and Vault references. Raw Vault, SIEM, IdP, and storage credentials never belong in the browser.", destination: "/secure-connectors", destinationLabel: "Open secure connectors" },
  { title: "Prove the governed path", detail: "Review coverage posture and the action trace after a controlled allow, block, or approval-required action. Missing records are evidence gaps, not proof of a bypass.", destination: "/coverage", destinationLabel: "Open coverage posture" },
] as const;

export const ENTERPRISE_PILOT_TOUR_STORAGE_KEY = "agentfence.enterprise-pilot-tour.v1";

type TourState = { step: number; completed: boolean };

export function normalizeEnterprisePilotTourState(value: Partial<TourState> | null | undefined): TourState {
  return { step: Math.max(0, Math.min(Number(value?.step) || 0, ENTERPRISE_PILOT_TOUR_STEPS.length - 1)), completed: value?.completed === true };
}

export function nextEnterprisePilotTourStep(step: number) {
  return Math.min(Math.max(0, step) + 1, ENTERPRISE_PILOT_TOUR_STEPS.length - 1);
}

export function enterprisePilotTourRecord(step: number, completed = false) {
  return JSON.stringify(normalizeEnterprisePilotTourState({ step, completed }));
}

function readTourState(): TourState {
  if (typeof window === "undefined") return { step: 0, completed: false };
  try {
    const raw = window.localStorage.getItem(ENTERPRISE_PILOT_TOUR_STORAGE_KEY);
    if (!raw) return { step: 0, completed: false };
    return normalizeEnterprisePilotTourState(JSON.parse(raw) as Partial<TourState>);
  } catch { return { step: 0, completed: false }; }
}

function persistTourState(state: TourState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ENTERPRISE_PILOT_TOUR_STORAGE_KEY, enterprisePilotTourRecord(state.step, state.completed));
}

export function EnterprisePilotTour({ open, onClose, onNavigate }: { open: boolean; onClose: () => void; onNavigate: (path: string) => void }) {
  const initial = useRef(readTourState()).current;
  const [step, setStep] = useState(initial.step);
  const closeRef = useRef<HTMLButtonElement>(null);
  const item = ENTERPRISE_PILOT_TOUR_STEPS[step];
  const isFinal = step === ENTERPRISE_PILOT_TOUR_STEPS.length - 1;
  const persist = (nextStep: number, completed = false) => persistTourState({ step: nextStep, completed });
  const close = () => { persist(step); onClose(); };
  const next = () => { if (isFinal) { persist(step, true); onClose(); return; } const nextStep = nextEnterprisePilotTourStep(step); setStep(nextStep); persist(nextStep); };
  const previous = () => { const previousStep = Math.max(0, step - 1); setStep(previousStep); persist(previousStep); };
  const openDestination = () => { persist(step); onClose(); onNavigate(item.destination); };

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (!open) return null;
  return <div className="pilot-tour-backdrop" role="presentation"><section className="pilot-tour" role="dialog" aria-modal="true" aria-labelledby="pilot-tour-title" aria-describedby="pilot-tour-detail"><div className="pilot-tour-top"><div className="pilot-tour-mark"><Compass size={18} /></div><div><p className="card-kicker">Guided enterprise pilot</p><span>Step {step + 1} of {ENTERPRISE_PILOT_TOUR_STEPS.length}</span></div><button ref={closeRef} type="button" className="pilot-tour-close" onClick={close} aria-label="Close guided pilot tour"><CircleX size={20} /></button></div><div className="pilot-tour-progress" aria-label={`Tour progress: step ${step + 1} of ${ENTERPRISE_PILOT_TOUR_STEPS.length}`}>{ENTERPRISE_PILOT_TOUR_STEPS.map((tourStep, index) => <span className={index === step ? "current" : index < step ? "complete" : ""} key={tourStep.title}><i>{index < step ? <CheckCircle2 size={12} /> : index + 1}</i><b>{tourStep.title}</b></span>)}</div><div className="pilot-tour-body"><p className="card-kicker">{item.destination.replace("/", "") || "workspace"}</p><h2 id="pilot-tour-title">{item.title}</h2><p id="pilot-tour-detail">{item.detail}</p><div className="pilot-tour-boundary"><ShieldCheck size={16} /><span>This guide explains the control path; it does not mark a setup task complete or bypass a required administrator review.</span></div></div><div className="pilot-tour-actions"><button type="button" className="btn-secondary" disabled={step === 0} onClick={previous}><ArrowLeft size={15} /> Back</button><button type="button" className="btn-secondary pilot-tour-destination" onClick={openDestination}>{item.destinationLabel}<ExternalLink size={14} /></button><button type="button" className="btn-primary" onClick={next}>{isFinal ? "Finish tour" : "Next step"}{isFinal ? <CheckCircle2 size={15} /> : <ArrowRight size={15} />}</button></div></section></div>;
}
