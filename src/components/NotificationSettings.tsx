"use client";

import { useEffect, useState } from "react";
import { Bell, Bug, Loader2, Mail, PlayCircle, Send, TriangleAlert } from "lucide-react";
import { Button, Card, Select, errorMessage, useToast } from "@/components/ui";

type Settings = {
  emailEnabled: boolean;
  email: string;
  runFailed: boolean;
  defectMinSeverity: "high" | "critical" | null;
};

// The signed-in person's email notifications for this project. Each change
// is saved right away.
export default function NotificationSettings({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/notifications`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setSettings)
      .catch(() => setLoadError(true));
  }, [projectId]);

  async function save(next: Pick<Settings, "runFailed" | "defectMinSeverity">) {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, ...next });
    setSaving(true);
    const res = await fetch(`/api/projects/${projectId}/notifications`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setSettings(previous);
      toast.error(res ? await errorMessage(res, "No se pudo guardar") : "No se pudo conectar con el servidor");
      return;
    }
    toast.success("Notificaciones actualizadas");
  }

  async function sendTest() {
    setTesting(true);
    const res = await fetch(`/api/projects/${projectId}/notifications/test`, { method: "POST" }).catch(
      () => null
    );
    setTesting(false);
    if (!res?.ok) {
      toast.error(res ? await errorMessage(res, "No se pudo enviar el correo") : "No se pudo conectar con el servidor");
      return;
    }
    toast.success("Correo de prueba enviado", `Revisa ${settings?.email}`);
  }

  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-medium text-slate-700 mb-1">
        <Bell size={15} className="text-slate-400" aria-hidden />
        Notificaciones por correo
      </h3>
      <p className="text-xs text-slate-500 mb-3">
        Elige qué avisos de {projectName} quieres recibir. Es una preferencia personal: cada persona
        configura las suyas.
      </p>

      <Card className="max-w-xl !p-0 divide-y divide-slate-100">
        {!settings ? (
          <p className="flex items-center gap-2 px-4 py-4 text-sm text-slate-400">
            {loadError ? (
              "No se pudieron cargar tus notificaciones. Recarga la página."
            ) : (
              <>
                <Loader2 size={15} className="animate-spin" aria-hidden /> Cargando…
              </>
            )}
          </p>
        ) : (
          <>
            {!settings.emailEnabled && (
              <div className="flex gap-2 px-4 py-3 bg-amber-50 text-sm text-amber-900 rounded-t-xl">
                <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
                <p>
                  El envío de correos no está configurado en el servidor, así que por ahora no llegará
                  ningún aviso. Un administrador debe definir <code>RESEND_API_KEY</code> y{" "}
                  <code>EMAIL_FROM</code>. Puedes dejar tus preferencias listas.
                </p>
              </div>
            )}

            <label className="flex items-start gap-3 px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={settings.runFailed}
                disabled={saving}
                onChange={(e) =>
                  save({ runFailed: e.target.checked, defectMinSeverity: settings.defectMinSeverity })
                }
              />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                  <PlayCircle size={15} className="text-slate-400" aria-hidden />
                  Runs con fallos
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Cuando llega un run de Playwright con fallos, o se marca como completado un run manual
                  que tiene casos fallidos o bloqueados. Incluye la lista de fallos y cuáles empezaron a
                  fallar en ese run.
                </span>
              </span>
            </label>

            <div className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span className="flex-1 min-w-56">
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                  <Bug size={15} className="text-slate-400" aria-hidden />
                  Defectos nuevos
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Cuando alguien reporta un defecto con esta severidad o mayor. No te avisa de los que
                  reportas tú.
                </span>
              </span>
              <Select
                value={settings.defectMinSeverity ?? ""}
                disabled={saving}
                onChange={(e) =>
                  save({
                    runFailed: settings.runFailed,
                    defectMinSeverity: (e.target.value || null) as Settings["defectMinSeverity"],
                  })
                }
                className="w-auto h-8"
                aria-label="Severidad mínima de los defectos"
              >
                <option value="">No avisarme</option>
                <option value="critical">Solo críticos</option>
                <option value="high">Altos y críticos</option>
              </Select>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-50/60 rounded-b-xl">
              <span className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
                <Mail size={13} aria-hidden className="shrink-0" />
                Se envían a <span className="font-medium text-slate-700 truncate">{settings.email}</span>
              </span>
              <Button
                size="xs"
                variant="secondary"
                icon={Send}
                loading={testing}
                disabled={!settings.emailEnabled}
                onClick={sendTest}
              >
                Enviar correo de prueba
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
