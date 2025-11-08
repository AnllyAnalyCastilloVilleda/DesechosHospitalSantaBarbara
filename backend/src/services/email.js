// src/services/email.js  (ESM + Resend SMTP)
import nodemailer from 'nodemailer';

const APP_NAME = process.env.APP_NAME || 'Hospital Santa Bárbara';
const APP_URL  = process.env.APP_URL  || 'http://localhost:5001';
const FROM     = process.env.MAIL_FROM || 'no-reply@hospitalsantabarbaramorales.com'; // debe ser del dominio verificado en Resend
const RESEND_API_KEY = 're_hYAMGm9V_7cy13inikMTdNc3wFmf9fyJ6';

if (!RESEND_API_KEY) {
  console.warn('[email] Falta RESEND_API_KEY. No se podrán enviar correos.');
}

export const transporter = nodemailer.createTransport({
  host: 'smtp.resend.com',
  port: 465,          // SSL implícito (recomendado por Resend)
  secure: true,       // true para 465
  auth: {
    user: 'resend',   // usuario fijo
    pass: 're_hYAMGm9V_7cy13inikMTdNc3wFmf9fyJ6',// tu API Key
  },
});

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function sendNewUserEmail({ to, name, email, tempPassword }) {
  const subject = `${APP_NAME}: Tu cuenta fue creada`;
  const html = `
    <p>Hola ${escapeHtml(name || '')},</p>
    <p>Se creó tu cuenta en <b>${escapeHtml(APP_NAME)}</b>.</p>
    <p><b>Usuario:</b> ${escapeHtml(email)}<br/>
       <b>Contraseña temporal:</b> ${escapeHtml(tempPassword)}</p>
    <p>Ingresa: <a href="${APP_URL}" target="_blank">${APP_URL}</a></p>
  `;
  const text = `Hola ${name || ''}\n\nSe creó tu cuenta en ${APP_NAME}.\nUsuario: ${email}\nContraseña temporal: ${tempPassword}\nIngresa: ${APP_URL}\n`;

  return transporter.sendMail({ from: FROM, to, subject, text, html });
}

export async function sendTempPasswordEmail({ to, name, email, tempPassword }) {
  const subject = `${APP_NAME}: Recuperación de contraseña`;
  const html = `
    <p>Hola ${escapeHtml(name || '')},</p>
    <p>Solicitaste restaurar tu acceso en <b>${escapeHtml(APP_NAME)}</b>.</p>
    <p><b>Usuario:</b> ${escapeHtml(email)}<br/>
       <b>Contraseña temporal:</b> ${escapeHtml(tempPassword)}</p>
    <p>Ingresa: <a href="${APP_URL}" target="_blank">${APP_URL}</a></p>
    <p>Por seguridad, Debera cambiarla al iniciar sesión.</p>
  `;
  const text = `Hola ${name || ''}\n\nRecuperación en ${APP_NAME}.\nUsuario: ${email}\nContraseña temporal: ${tempPassword}\nIngresa: ${APP_URL}\nCámbiala al iniciar.\n`;

  return transporter.sendMail({ from: FROM, to, subject, text, html });
}
