import { t } from "./i18n.js";

export async function ensureNotificationPermission() {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission !== "denied") {
    return (await Notification.requestPermission()) === "granted";
  }
  return false;
}

export function showChangeAlert(change) {
  const { before, after } = change;
  const el = document.createElement("div");
  el.className = "alert-card";
  el.innerHTML = `
    <strong>⚠️ ${t("changeAlert")}</strong>
    <div>${t("trainMeta", {
      no: after.trainNo,
      type: after.trainTypeName || "",
      dest: after.endingStation || "",
    })}</div>
    <div>${t("changePlatform", {
      from: before.platform ?? "—",
      to: after.platform ?? "—",
    })}</div>
    <div>${t("changeDelay", {
      from: before.delayMin,
      to: after.delayMin,
    })}</div>
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 8000);

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(t("notifyTitle"), {
      body: `${after.trainNo}: ${t("changePlatform", {
        from: before.platform ?? "—",
        to: after.platform ?? "—",
      })}`,
    });
  }
}
