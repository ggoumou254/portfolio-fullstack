@@
-const PORT = Number(process.env.SMTP_PORT || 587);
-const SECURE = (process.env.SMTP_SECURE === 'true') || PORT === 465;
+// Consiglio: Gmail in prod → 465 + TLS implicito
+const PORT = Number(process.env.SMTP_PORT || 465);
+const SECURE = (process.env.SMTP_SECURE === 'true') || PORT === 465;
@@
   DEFAULTS: {
-    from: process.env.EMAIL_FROM || (process.env.SMTP_USER ? `"Portfolio" <${process.env.SMTP_USER}>` : undefined),
-    replyTo: process.env.SMTP_USER
+    // Supporta sia FROM_EMAIL che EMAIL_FROM. Fallback su SMTP_USER.
+    from:
+      process.env.FROM_EMAIL
+      || process.env.EMAIL_FROM
+      || (process.env.SMTP_USER ? `"Portfolio" <${process.env.SMTP_USER}>` : undefined),
+    // di default NESSUN replyTo; lo passeremo dalla rotta contatti con l'email del visitatore
+    replyTo: undefined
   },
@@
-  if (EMAIL_CONFIG.ENV === 'production') {
-    transporter.verify()
-      .then(() => logger.success('SMTP raggiungibile (prod)', {
-        host: EMAIL_CONFIG.SMTP.host, port: EMAIL_CONFIG.SMTP.port, secure: EMAIL_CONFIG.SMTP.secure
-      }))
-      .catch(err => logger.warn('SMTP non raggiungibile ora (prod, non fatale)', { message: err?.message }));
-  } else {
+  if (EMAIL_CONFIG.ENV !== 'production') {
     // In dev: va bene vedere subito l'errore, aiuta il debug
     transporter.verify((err) => {
       if (err) logger.error('Errore verifica SMTP', { message: err.message });
       else logger.success('SMTP verificato', {
         host: EMAIL_CONFIG.SMTP.host, port: EMAIL_CONFIG.SMTP.port, secure: EMAIL_CONFIG.SMTP.secure
       });
     });
   }
@@
-export async function sendMail({ to, subject, html, text }) {
+export async function sendMail({ to, subject, html, text, replyTo, cc, bcc, attachments } = {}) {
   if (!transporter) throw new Error('SMTP non configurato');
   if (!to) throw new Error('Campo "to" mancante');
   if (!subject) throw new Error('Campo "subject" mancante');
   if (!html && !text) throw new Error('Serve "html" o "text"');
 
   const opts = {
     from: EMAIL_CONFIG.DEFAULTS.from,
-    replyTo: EMAIL_CONFIG.DEFAULTS.replyTo,
+    replyTo: replyTo || EMAIL_CONFIG.DEFAULTS.replyTo,
     to,
     subject,
     html,
     text,
+    cc,
+    bcc,
+    attachments,
     headers: { 'X-App': 'Portfolio' },
   };
 
   const info = await transporter.sendMail(opts);
   logger.success('Email inviata', { to, subject, messageId: info.messageId });
   return info;
 }
@@
 export function getEmailStatus() {
   return {
     configured: isSmtpConfigured(),
     env: EMAIL_CONFIG.ENV,
     smtp: {
       host: EMAIL_CONFIG.SMTP.host,
       port: EMAIL_CONFIG.SMTP.port,
       secure: EMAIL_CONFIG.SMTP.secure,
       user: EMAIL_CONFIG.SMTP.auth?.user ? `${EMAIL_CONFIG.SMTP.auth.user.slice(0, 3)}...` : 'non configurato',
     },
     outputDir: EMAIL_CONFIG.OUTDIR,
   };
 }
 
 export { transporter };
+
+// Facile health-check SMTP senza inviare email
+export async function verifySmtp() {
+  if (!transporter) throw new Error('SMTP non configurato');
+  await transporter.verify();
+  return { ok: true };
+}
