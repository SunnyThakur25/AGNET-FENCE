import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { CircleAlert, Check, ExternalLink, KeyRound, Laptop, LogOut, Monitor, ShieldCheck, Smartphone, Trash2, Upload, UserRound, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge, PageFrame, SecondaryButton } from "./Console";

export const DELETE_ACCOUNT_CONFIRMATION = "DELETE MY ACCOUNT";

export function initials(name: string | null | undefined) {
  return name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "A";
}

export function isSupportedAvatarDataUrl(value: string) {
  return /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function sessionIcon(deviceInfo: string | null) {
  const device = (deviceInfo ?? "").toLowerCase();
  if (device.includes("iphone") || device.includes("android") || device.includes("mobile")) return Smartphone;
  if (device.includes("mac") || device.includes("windows") || device.includes("linux")) return Laptop;
  return Monitor;
}

export function DeleteAccountConfirmationModal({ open, confirmation, pending, onClose, onConfirmationChange, onConfirm }: { open: boolean; confirmation: string; pending: boolean; onClose: () => void; onConfirmationChange: (value: string) => void; onConfirm: () => void }) {
  if (!open) return null;
  return <div className="account-modal-backdrop" role="presentation"><div className="account-modal" role="dialog" aria-modal="true" aria-labelledby="delete-account-title"><button className="account-modal-close" type="button" aria-label="Close delete account dialog" onClick={onClose}><X size={17} /></button><div className="account-modal-icon"><Trash2 size={19} /></div><p className="card-kicker">Final confirmation</p><h2 id="delete-account-title">Delete your AgentFence account?</h2><p>This cannot be undone. Type <strong>{DELETE_ACCOUNT_CONFIRMATION}</strong> to permanently remove your profile and eligible personal workspaces.</p><label className="account-field"><span>Confirmation phrase</span><input autoFocus value={confirmation} onChange={event => onConfirmationChange(event.target.value)} placeholder={DELETE_ACCOUNT_CONFIRMATION} /></label><div className="account-modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="danger-button" disabled={confirmation !== DELETE_ACCOUNT_CONFIRMATION || pending} onClick={onConfirm}>{pending ? "Deleting…" : "Delete permanently"}</button></div></div></div>;
}

export function ProfileAccountPage() {
  const { user, refresh } = useAuth({ redirectOnUnauthenticated: true });
  const profile = trpc.account.profile.useQuery(undefined, { enabled: Boolean(user) });
  const updateProfile = trpc.account.updateProfile.useMutation({ onSuccess: async () => { await profile.refetch(); await refresh(); toast.success("Profile updated."); } });
  const uploadAvatar = trpc.account.uploadAvatar.useMutation({ onSuccess: async result => { await profile.refetch(); await refresh(); toast.success("Avatar updated."); setPreview(result.avatarUrl); } });
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => { if (profile.data) { setName(profile.data.name ?? ""); setPreview(profile.data.avatarUrl ?? null); } }, [profile.data]);

  const handleAvatar = (file: File | undefined) => {
    if (!file) return;
    if (!(["image/png", "image/jpeg", "image/webp"] as string[]).includes(file.type)) { toast.error("Use a PNG, JPEG, or WebP image."); return; }
    if (file.size > 1_000_000) { toast.error("Avatar must be smaller than 1 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") uploadAvatar.mutate({ dataUrl: reader.result }); };
    reader.readAsDataURL(file);
  };

  return <PageFrame eyebrow="Profile & account" title="Your operator profile" description="Personalize your AgentFence identity while keeping authentication and account controls explicit and auditable.">
    <section className="account-grid">
      <article className="console-card profile-identity-card">
        <div className="account-avatar-wrap"><div className="account-avatar">{preview ? <img src={preview} alt="Profile avatar" /> : initials(profile.data?.name ?? user?.name)}</div><button className="avatar-upload-button" type="button" onClick={() => fileRef.current?.click()} disabled={uploadAvatar.isPending}><Upload size={14} /> {uploadAvatar.isPending ? "Uploading…" : "Upload avatar"}</button><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => handleAvatar(event.target.files?.[0])} /></div>
        <div><p className="card-kicker">Authenticated identity</p><h2>{profile.data?.email || user?.email || "AgentFence operator"}</h2><p className="account-muted">Avatar files are limited to 1 MB and stored in the managed object-storage boundary. Raw file bytes are never placed in the database.</p></div>
      </article>
      <article className="console-card account-form-card"><div className="card-heading"><div><p className="card-kicker">Profile details</p><h2>Account name</h2></div><UserRound size={18} className="text-cyan-300" /></div><label className="account-field"><span>Display name</span><input value={name} onChange={event => setName(event.target.value)} maxLength={120} placeholder="Your name" /></label><label className="account-field"><span>Email</span><input value={profile.data?.email ?? user?.email ?? ""} readOnly /></label><div className="account-actions"><SecondaryButton disabled={updateProfile.isPending || name.trim().length < 2} onClick={() => updateProfile.mutate({ name: name.trim() })}><Check size={15} /> {updateProfile.isPending ? "Saving…" : "Save profile"}</SecondaryButton></div></article>
    </section>
  </PageFrame>;
}

export function SecurityConnectionsPage() {
  const { user, logout } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const sessions = trpc.account.sessions.list.useQuery(undefined, { enabled: Boolean(user) });
  const provider = trpc.account.passwordProvider.useQuery(undefined, { enabled: Boolean(user) });
  const startPasswordChange = trpc.account.startPasswordChange.useMutation();
  const revoke = trpc.account.sessions.revoke.useMutation({ onSuccess: async () => { await sessions.refetch(); toast.success("Session revoked."); } });
  const revokeOthers = trpc.account.sessions.revokeOthers.useMutation({ onSuccess: async result => { await sessions.refetch(); toast.success(`${result.revokedCount} other session${result.revokedCount === 1 ? "" : "s"} revoked.`); } });
  const deleteAccount = trpc.account.deleteAccount.useMutation();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const activeSessions = useMemo(() => sessions.data ?? [], [sessions.data]);

  const changePassword = async () => {
    const result = await startPasswordChange.mutateAsync();
    window.location.href = result.managementUrl;
  };

  const permanentlyDelete = async () => {
    try {
      await deleteAccount.mutateAsync({ confirmation: DELETE_ACCOUNT_CONFIRMATION });
      await logout();
      navigate("/signin");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Account deletion could not be completed.");
    }
  };

  return <PageFrame eyebrow="Security & connections" title="Protect your access" description="Manage your identity-provider password, active sessions, and account lifecycle from one security boundary.">
    <section className="security-settings-stack">
      <article className="console-card security-provider-card"><div className="card-heading"><div><p className="card-kicker">Password & sign-in</p><h2>Password management</h2></div><KeyRound size={19} className="text-cyan-300" /></div><div className="provider-row"><div className="provider-icon"><ShieldCheck size={18} /></div><div className="min-w-0 flex-1"><strong>{provider.data?.loginMethod ?? "Identity provider"}</strong><p>AgentFence does not store a local password. Password changes are completed by the authenticated OAuth or SSO provider.</p></div><Badge tone="good">Provider-managed</Badge></div><SecondaryButton disabled={startPasswordChange.isPending} onClick={changePassword}><ExternalLink size={15} /> {startPasswordChange.isPending ? "Opening…" : "Change password"}</SecondaryButton></article>
      <article className="console-card"><div className="card-heading"><div><p className="card-kicker">Active sessions</p><h2>Where you are signed in</h2></div><div className="session-heading-actions"><Badge tone="info">{activeSessions.length} active</Badge><SecondaryButton disabled={revokeOthers.isPending || activeSessions.filter(session => !session.current).length === 0} onClick={() => revokeOthers.mutate()}><LogOut size={15} /> Sign out others</SecondaryButton></div></div><div className="session-list">{activeSessions.length ? activeSessions.map(session => { const Icon = sessionIcon(session.deviceInfo); return <div className="session-row" key={session.id}><div className="session-device-icon"><Icon size={17} /></div><div className="min-w-0 flex-1"><div className="session-title"><strong>{session.current ? "This device" : session.deviceInfo || "Authenticated device"}</strong>{session.current && <Badge tone="good">Current</Badge>}</div><p>{session.ipAddress || "Network address unavailable"} · Last active {formatDate(session.lastActiveAt)}</p><small>Created {formatDate(session.createdAt)} · Expires {formatDate(session.expiresAt)}</small></div>{!session.current && <button className="session-revoke" type="button" disabled={revoke.isPending} onClick={() => revoke.mutate({ sessionId: session.id })}>Revoke</button>}</div>; }) : <div className="account-empty"><CircleAlert size={17} /><span>No active session records yet. Your current session will appear after the next authenticated request.</span></div>}</div></article>
      <article className="console-card account-danger-zone"><div className="card-heading"><div><p className="card-kicker">Irreversible action</p><h2>Delete Account</h2></div><Trash2 size={19} className="text-rose-300" /></div><p>This permanently removes your AgentFence user profile and any personal-only workspace data. Shared workspaces must be transferred or have their other members removed first.</p><button type="button" className="danger-button" onClick={() => setDeleteOpen(true)}><Trash2 size={15} /> Delete Account</button></article>
    </section>
    <DeleteAccountConfirmationModal open={deleteOpen} confirmation={confirmation} pending={deleteAccount.isPending} onClose={() => setDeleteOpen(false)} onConfirmationChange={setConfirmation} onConfirm={permanentlyDelete} />
  </PageFrame>;
}
