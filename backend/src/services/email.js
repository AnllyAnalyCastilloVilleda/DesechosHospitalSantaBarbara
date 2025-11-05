// src/services/email.js  (ESM) — usando API HTTP de Resend (sin SMTP)
import { Resend } from 'resend';

const APP_NAME = process.env.APP_NAME || 'Hospital Santa Bárbara';
const APP_URL  = process.env.APP_URL  || 'http://localhost:5001';

/**
 * IMPORTANTE:
 * MAIL_FROM debe ser un remitente de un dominio VERIFICADO en Resend.
 * Ej: 'Hospital Santa Bárbara <noreply@hospitalsantabarbara.it.com>'
 */
const FROM = process.env.MAIL_FROM || 'Hospital Santa Bárbara <noreply@example.com>';

const resend = new Resend(process.env.RESEND_API_KEY);

/* ---------------- Utilidades ---------------- */
function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Plantilla base (sin encabezado superior) */
function baseHtml({ title, greeting, intro, rows = [], cta, footerNote }) {
  const brand = {
    primary: '#2d1b69',
    accent:  '#3557ff',
    text:    '#0f172a',
    muted:   '#64748b',
    line:    '#e2e8f0',
    card:    '#ffffff',
    bg:      '#f6f8ff',
  };

  const rowsHtml = rows.map(r => `
    <tr>
      <td style="padding:6px 10px;color:${brand.muted};white-space:nowrap">${r.label}:</td>
      <td style="padding:6px 10px">${r.value}</td>
    </tr>
  `).join('');

  const ctaHtml = cta ? `
    <p style="margin:18px 0">
      <a href="${escapeHtml(cta.href)}" target="_blank"
         style="background:${brand.accent};color:#fff;text-decoration:none;
                padding:12px 18px;border-radius:12px;display:inline-block;font-weight:600">
        ${escapeHtml(cta.text)}
      </a>
    </p>` : '';

  return `
<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:${brand.bg};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${brand.bg};padding:28px 0">
      <tr>
        <td align="center">
          <table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">
            <tr>
              <td>
                <div style="background:${brand.card};border-radius:16px;padding:26px;border:1px solid ${brand.line};
                            box-shadow:0 8px 28px rgba(17,24,39,.08);
                            font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${brand.text}">
                  <h1 style="margin:0 0 8px 0;font-size:22px;line-height:1.2;color:${brand.primary};">${escapeHtml(title)}</h1>
                  <p style="margin:0 0 8px 0;">${greeting}</p>
                  ${intro ? `<p style="margin:0 0 14px 0;color:${brand.text}">${intro}</p>` : ''}
                  <table role="presentation" style="margin:6px 0;border-collapse:collapse;width:auto">
                    ${rowsHtml}
                  </table>
                  ${ctaHtml}
                  <p style="margin:10px 0 0 0;font-size:12px;color:${brand.muted}">
                    ${footerNote || 'Si no esperabas este correo, puedes ignorarlo.'}
                  </p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="text-align:center;padding:14px 10px;color:${brand.muted};
                         font-size:12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
                © ${new Date().getFullYear()} ${escapeHtml(APP_NAME)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/* ---------------- Envío por Resend (HTTP) ---------------- */
async function sendMail({ to, subject, html, text }) {
  try {
    // Acepta string o array para "to"
    const toList = Array.isArray(to) ? to : [to];

    const { data, error } = await resend.emails.send({
      from: FROM,              // Debe ser dominio verificado
      to: toList,
      subject,
      html,
      text,
    });

    if (error) {
      console.error('Fallo al enviar correo (Resend API):', error);
      return { ok: false, error: 'No se pudo enviar el correo en este momento.' };
    }

    return { ok: true, info: data };
  } catch (err) {
    console.error('Fallo al enviar correo (catch):', err);
    return { ok: false, error: 'No se pudo enviar el correo en este momento.' };
  }
}

/* ---------------- Emails concretos ---------------- */
export async function sendNewUserEmail({ to, nombre, usuario, tempPassword, rolNombre }) {
  const safeNombre  = escapeHtml(nombre);
  const safeUsuario = escapeHtml(usuario);
  const safeRol     = escapeHtml(rolNombre || 'Sin rol');

  const rows = [
    { label: 'Usuario', value: `<b>${safeUsuario}</b>` },
    { label: 'Rol asignado', value: `<span style="display:inline-block;background:#eef2ff;color:#1e3a8a;padding:4px 10px;border-radius:10px;font-weight:600">${safeRol}</span>` },
  ];
  if (tempPassword) rows.push({ label: 'Contraseña temporal', value: `<b>${escapeHtml(tempPassword)}</b>` });

  const html = baseHtml({
    title: APP_NAME,
    greeting: `Hola <b>${safeNombre}</b>, se creó tu usuario en el sistema.`,
    intro: 'Al ingresar se te pedirá <b>cambiar la contraseña</b> por seguridad.',
    rows,
    cta: { text: 'Entrar al sistema', href: APP_URL },
    footerNote: 'Si no esperabas este correo, ignóralo. No compartas tu contraseña con nadie.'
  });

  const text = [
    `${APP_NAME} — Bienvenido/a`,
    `Hola ${nombre}, se creó tu usuario en el sistema.`,
    `Usuario: ${usuario}`,
    `Rol asignado: ${rolNombre || 'Sin rol'}`,
    tempPassword ? `Contraseña temporal: ${tempPassword}` : '',
    `Acceso: ${APP_URL}`,
    'Al ingresar se te pedirá cambiar la contraseña.'
  ].filter(Boolean).join('\n');

  return sendMail({ to, subject: 'Tu acceso al sistema', html, text });
}

export async function sendTempPasswordEmail({ to, nombre, usuario, tempPassword, rolNombre }) {
  const safeNombre  = escapeHtml(nombre);
  const safeUsuario = escapeHtml(usuario);
  const safeRol     = escapeHtml(rolNombre || 'Sin rol');

  const rows = [
    { label: 'Usuario', value: `<b>${safeUsuario}</b>` },
    { label: 'Rol asignado', value: `<span style="display:inline-block;background:#eef2ff;color:#1e3a8a;padding:4px 10px;border-radius:10px;font-weight:600">${safeRol}</span>` },
    { label: 'Contraseña temporal', value: `<b>${escapeHtml(tempPassword)}</b>` },
  ];

  const html = baseHtml({
    title: APP_NAME,
    greeting: `Hola <b>${safeNombre}</b>, tu nueva contraseña temporal es:`,
    rows,
    intro: 'Al ingresar se te pedirá <b>cambiarla</b>.',
    cta: { text: 'Entrar al sistema', href: APP_URL },
    footerNote: 'Si no solicitaste esta acción, te recomendamos cambiar tu contraseña al ingresar.'
  });

  const text = [
    `${APP_NAME} — Nueva contraseña temporal`,
    `Hola ${nombre}, tu nueva contraseña temporal es:`,
    `Usuario: ${usuario}`,
    `Rol asignado: ${rolNombre || 'Sin rol'}`,
    `Contraseña temporal: ${tempPassword}`,
    `Acceso: ${APP_URL}`,
    'Al ingresar se te pedirá cambiarla.'
  ].join('\n');

  return sendMail({ to, subject: 'Nueva contraseña temporal', html, text });
}

export default { sendNewUserEmail, sendTempPasswordEmail };
