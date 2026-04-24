const { google } = require('googleapis');
const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const data = JSON.parse(event.body);
    const { to, subject, body, ref, client, attachments = [] } = data;

    // Auth Google pour Drive uniquement
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/drive']
    });

    const drive = google.drive({ version: 'v3', auth });

    // Créer sous-dossier Drive
    const folder = await drive.files.create({
      requestBody: {
        name: `${ref} — ${client} — ${new Date().toLocaleDateString('fr-CH')}`,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [process.env.DRIVE_FOLDER_ID]
      },
      fields: 'id, webViewLink'
    });

    const folderId  = folder.data.id;
    const folderUrl = folder.data.webViewLink;

    // Upload photos
    const { Readable } = require('stream');
    for (const photo of attachments) {
      const buf    = Buffer.from(photo.data, 'base64');
      const stream = Readable.from(buf);
      await drive.files.create({
        requestBody: { name: photo.name, parents: [folderId] },
        media:       { mimeType: photo.type, body: stream }
      });
    }

    // Rendre le dossier visible
    await drive.permissions.create({
      fileId: folderId,
      requestBody: { role: 'reader', type: 'anyone' }
    });

    // Envoyer email via SMTP Gmail
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: '9bergil@gmail.com',
        pass: process.env.GMAIL_PASSWORD
      }
    });

    const emailBody = body
      + '\n\n── PHOTOS ─────────────────────────\n'
      + attachments.length + ' photo(s) sur Google Drive :\n'
      + folderUrl;

    await transporter.sendMail({
      from: 'Bizzini Terrain <9bergil@gmail.com>',
      to:      to,
      subject: subject,
      text:    emailBody
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'ok', url: folderUrl })
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ status: 'error', message: err.message })
    };
  }
};
