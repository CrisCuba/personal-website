document.addEventListener('DOMContentLoaded', () => {
    // Theme Switcher
    const themeToggle = document.getElementById('theme-toggle');
    const themeIcon = themeToggle.querySelector('i');
    
    // Check for saved theme preference or default to 'light'
    const currentTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeIcon(currentTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    });

    function updateThemeIcon(theme) {
        themeIcon.className = theme === 'light' 
            ? 'fa-solid fa-moon' 
            : 'fa-solid fa-sun';
    }

    // Typed Text Effect
    const typedTextElement = document.querySelector('.typed-text');
    const phrases = [
        'Frontend Developer 💻',
        'Team Leader 👥',
        'Problem Solver 🎯',
        'User-Centric Developer ⚡'
    ];
    let phraseIndex = 0;
    let letterIndex = 0;
    let currentPhrase = [];
    let isDeleting = false;

    function type() {
        const currentText = [...phrases[phraseIndex]]; // Convertir el string en un array de caracteres Unicode
        
        if (isDeleting) {
            currentPhrase.pop();
        } else {
            if (letterIndex < currentText.length) {
                currentPhrase.push(currentText[letterIndex]);
            }
        }
        
        typedTextElement.textContent = currentPhrase.join('');
        
        if (!isDeleting && letterIndex === currentText.length) {
            isDeleting = true;
            setTimeout(type, 2000); // Wait before starting to delete
            return;
        }
        
        if (isDeleting && currentPhrase.length === 0) {
            isDeleting = false;
            phraseIndex = (phraseIndex + 1) % phrases.length;
            letterIndex = 0;
            setTimeout(type, 500); // Wait before typing next phrase
            return;
        }
        
        letterIndex = isDeleting ? letterIndex : letterIndex + 1;
        setTimeout(type, isDeleting ? 50 : 150); // Faster deletion, slower typing
    }

    type();

    // Smooth Scrolling
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth'
            });
        });
    });

    class SecurityManager {
        constructor() {
            this.encryptionKey = null;
        }

        async initialize() {
            // Generar o recuperar la clave de encriptación
            this.encryptionKey = await this.getOrCreateEncryptionKey();
        }

        async getOrCreateEncryptionKey() {
            // Usar SubtleCrypto para generar una clave segura
            return await window.crypto.subtle.generateKey(
                {
                    name: "AES-GCM",
                    length: 256
                },
                true,
                ["encrypt", "decrypt"]
            );
        }

        async encryptData(data) {
            try {
                // Crear un IV (Vector de Inicialización) aleatorio
                const iv = window.crypto.getRandomValues(new Uint8Array(12));
                
                // Convertir datos a formato encriptable
                const encodedData = new TextEncoder().encode(JSON.stringify(data));
                
                // Encriptar los datos
                const encryptedData = await window.crypto.subtle.encrypt(
                    {
                        name: "AES-GCM",
                        iv: iv
                    },
                    this.encryptionKey,
                    encodedData
                );

                // Combinar IV y datos encriptados
                const encryptedArray = new Uint8Array(iv.length + encryptedData.byteLength);
                encryptedArray.set(iv);
                encryptedArray.set(new Uint8Array(encryptedData), iv.length);

                return encryptedArray;
            } catch (error) {
                console.error('Encryption error:', error);
                throw new Error('Failed to encrypt data');
            }
        }

        async decryptData(encryptedData) {
            try {
                // Separar IV y datos encriptados
                const iv = encryptedData.slice(0, 12);
                const data = encryptedData.slice(12);

                // Desencriptar
                const decryptedData = await window.crypto.subtle.decrypt(
                    {
                        name: "AES-GCM",
                        iv: iv
                    },
                    this.encryptionKey,
                    data
                );

                // Convertir datos desencriptados a objeto
                return JSON.parse(new TextDecoder().decode(decryptedData));
            } catch (error) {
                console.error('Decryption error:', error);
                throw new Error('Failed to decrypt data');
            }
        }
    }

    class ContactDatabase {
        constructor() {
            this.dbName = 'ContactFormDB';
            this.dbVersion = 1;
            this.storeName = 'messages';
            this.security = new SecurityManager();
            this.init();
        }

        async init() {
            try {
                const request = indexedDB.open(this.dbName, this.dbVersion);
                
                request.onerror = (event) => {
                    console.error('Database error:', event.target.error);
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName, { keyPath: 'id' });
                    }
                };

                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    console.log('Database initialized successfully');
                };
            } catch (error) {
                console.error('Error initializing database:', error);
            }
        }

        async saveMessage(message) {
            return new Promise(async (resolve, reject) => {
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }

                try {
                    const transaction = this.db.transaction([this.storeName], 'readwrite');
                    const store = transaction.objectStore(this.storeName);

                    // Agregar timestamp e ID si no existen
                    const messageToSave = {
                        ...message,
                        id: message.id || Date.now(),
                        timestamp: message.timestamp || new Date().toISOString(),
                        read: false
                    };

                    const request = store.add(messageToSave);

                    request.onsuccess = () => {
                        console.log('Message saved to IndexedDB successfully');
                        resolve(messageToSave);
                    };

                    request.onerror = (event) => {
                        console.error('Error saving to IndexedDB:', event.target.error);
                        reject(event.target.error);
                    };

                    transaction.oncomplete = () => {
                        console.log('Transaction completed');
                    };
                } catch (error) {
                    console.error('Error in saveMessage:', error);
                    reject(error);
                }
            });
        }

        async getAllMessages() {
            return new Promise((resolve, reject) => {
                if (!this.db) {
                    reject(new Error('Database not initialized'));
                    return;
                }

                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.getAll();

                request.onsuccess = () => {
                    resolve(request.result);
                };

                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        }
    }

    // Initialize contact database
    const contactDB = new ContactDatabase();

    class NotificationManager {
        constructor() {
            this.createNotificationContainer();
        }

        createNotificationContainer() {
            this.container = document.createElement('div');
            this.container.id = 'notification-container';
            document.body.appendChild(this.container);
        }

        show(message, type = 'success', duration = 3000) {
            const notification = document.createElement('div');
            notification.className = `notification ${type}`;
            
            const icon = type === 'success' ? '✓' : '⚠';
            notification.innerHTML = `
                <div class="notification-content">
                    <span class="notification-icon">${icon}</span>
                    <span class="notification-message">${message}</span>
                </div>
            `;

            this.container.appendChild(notification);
            
            // Trigger reflow for animation
            notification.offsetHeight;
            notification.classList.add('show');

            setTimeout(() => {
                notification.classList.remove('show');
                setTimeout(() => {
                    this.container.removeChild(notification);
                }, 300);
            }, duration);
        }
    }

    class FormManager {
        constructor(form) {
            this.form = form;
            this.feedback = form.querySelector('.form-feedback');
            this.notification = new NotificationManager();
        }

        showFeedback(message, type) {
            this.feedback.textContent = message;
            this.feedback.className = `form-feedback ${type} show`;
        }

        clearFeedback() {
            this.feedback.className = 'form-feedback';
            this.feedback.textContent = '';
        }

        async resetForm() {
            this.form.classList.add('resetting');
            this.form.reset();
            await new Promise(resolve => setTimeout(resolve, 300));
            this.form.classList.remove('resetting');
            this.clearFeedback();
        }

        disableForm(disable = true) {
            const elements = this.form.querySelectorAll('input, textarea, button');
            elements.forEach(element => {
                element.disabled = disable;
            });
        }
    }

    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        const formManager = new FormManager(contactForm);

        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            formManager.disableForm(true);

            const formData = {
                name: contactForm.querySelector('[name="name"]').value.trim(),
                email: contactForm.querySelector('[name="email"]').value.trim(),
                message: contactForm.querySelector('[name="message"]').value.trim()
            };

            // Validate form data
            if (!formData.name || !formData.email || !formData.message) {
                formManager.showFeedback('Please fill in all fields', 'error');
                formManager.disableForm(false);
                return;
            }

            try {
                // First try to save to server
                const response = await fetch('http://localhost:3000/api/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Server error');
                }

                const serverMessage = await response.json();
                console.log('Message saved to server:', serverMessage);

                // Then save to IndexedDB with the server-generated ID
                await contactDB.saveMessage({
                    ...formData,
                    id: serverMessage.id,
                    date: serverMessage.date,
                    read: serverMessage.read
                });
                console.log('Message saved to IndexedDB');

                formManager.notification.show('Message sent successfully!', 'success');
                await formManager.resetForm();
            } catch (error) {
                console.error('Error saving message:', error);
                formManager.notification.show(error.message || 'Error sending message. Please try again.', 'error');
            } finally {
                formManager.disableForm(false);
            }
        });
    }

    // Scroll functionality
    const nav = document.querySelector('.main-nav');
    const scrollBtn = document.getElementById('scroll-btn');
    const heroImage = document.querySelector('.hero-profile-image');
    let isAtBottom = false;

    function handleScroll() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        
        // Handle navigation style based on hero image position
        if (heroImage) {
            const heroRect = heroImage.getBoundingClientRect();
            if (heroRect.bottom <= 0) {
                nav.classList.add('contracted');
                nav.classList.remove('vertical');
            } else {
                nav.classList.remove('contracted');
            }
        }

        // Handle scroll button direction
        if (scrollTop === 0) {
            scrollBtn.classList.remove('bottom');
            isAtBottom = false;
        } else if (scrollTop + windowHeight >= documentHeight - 50) {
            scrollBtn.classList.add('bottom');
            isAtBottom = true;
        }
    }

    function handleScrollButtonClick() {
        if (isAtBottom) {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        } else {
            window.scrollTo({
                top: document.documentElement.scrollHeight,
                behavior: 'smooth'
            });
        }
    }

    window.addEventListener('scroll', handleScroll);
    scrollBtn.addEventListener('click', handleScrollButtonClick);
});
