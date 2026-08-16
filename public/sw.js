// Service worker da Central de Jogos.
// Roda em segundo plano (mesmo com o site fechado) e é quem recebe o push
// do servidor e mostra a notificação na bandeja do sistema.

self.addEventListener("install", (event) => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

// Evento disparado quando o servidor manda uma atualização de placar.
self.addEventListener("push", (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: "Central de Jogos", body: event.data.text() }
  }

  const {
    title = "Central de Jogos",
    body = "",
    tag = "central-de-jogos",
    url = "/",
    icon = "/icon-192.png",
    badge = "/badge-96.png",
    silent = false,
  } = payload

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag, // mesmo tag = substitui a notificação anterior em vez de empilhar
      renotify: !silent, // vibra/alerta de novo só quando o placar muda de verdade
      icon,
      badge,
      data: { url },
      requireInteraction: false,
    }),
  )
})

// Ao tocar na notificação, abre (ou foca) o jogo dentro do app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || "/"

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    }),
  )
})
