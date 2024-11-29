require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// Configurar el transporte de correo
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Ruta para guardar mensajes
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        
        // Guardar en archivo
        const contactData = {
            name,
            email,
            message,
            date: new Date().toISOString()
        };

        const dataPath = path.join(__dirname, '../data/contact-messages.json');
        let messages = [];
        
        if (fs.existsSync(dataPath)) {
            const fileContent = fs.readFileSync(dataPath, 'utf8');
            messages = JSON.parse(fileContent);
        }
        
        messages.push(contactData);
        fs.writeFileSync(dataPath, JSON.stringify(messages, null, 2));

        // Enviar email
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.DESTINATION_EMAIL,
            subject: `Nuevo mensaje de contacto de ${name}`,
            text: `
                Nombre: ${name}
                Email: ${email}
                Mensaje: ${message}
            `
        };

        await transporter.sendMail(mailOptions);

        res.json({ success: true, message: 'Mensaje enviado correctamente' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: 'Error al enviar el mensaje' });
    }
});

// Ruta para obtener mensajes (protegida)
app.get('/api/messages', (req, res) => {
    try {
        const dataPath = path.join(__dirname, '../data/contact-messages.json');
        if (!fs.existsSync(dataPath)) {
            return res.json([]);
        }
        
        const messages = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        res.json(messages);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ success: false, message: 'Error al obtener mensajes' });
    }
});

app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});
