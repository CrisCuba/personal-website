class SecurityManager {
    constructor() {
        this.encryptionKey = null;
    }

    async initialize() {
        this.encryptionKey = await this.getOrCreateEncryptionKey();
    }

    async getOrCreateEncryptionKey() {
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
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encodedData = new TextEncoder().encode(JSON.stringify(data));
            
            const encryptedData = await window.crypto.subtle.encrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                this.encryptionKey,
                encodedData
            );

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
            const iv = encryptedData.slice(0, 12);
            const data = encryptedData.slice(12);

            const decryptedData = await window.crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: iv
                },
                this.encryptionKey,
                data
            );

            return JSON.parse(new TextDecoder().decode(decryptedData));
        } catch (error) {
            console.error('Decryption error:', error);
            throw new Error('Failed to decrypt data');
        }
    }
}

class AdminPanel {
    constructor() {
        this.messages = [];
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.selectedDate = '';
        this.apiBaseUrl = 'http://localhost:3000/api';
        this.dbName = 'ContactFormDB';
        this.dbVersion = 1;
        this.storeName = 'messages';
        this.db = null;
        this.security = new SecurityManager();
        
        // Asegurarse de que el DOM está cargado antes de inicializar
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    async initialize() {
        try {
            await this.security.initialize();
            await this.initializeDB();
            this.initializeEventListeners();
            await this.loadMessages();
        } catch (error) {
            console.error('Failed to initialize admin panel:', error);
            this.showError('Initialization failed: ' + error.message);
        }
    }

    async initializeDB() {
        return new Promise((resolve, reject) => {
            let request;
            try {
                // Intentar cerrar la conexión existente si hay una
                if (this.db) {
                    this.db.close();
                    this.db = null;
                }

                // Eliminar la base de datos existente para forzar una nueva creación
                const deleteRequest = indexedDB.deleteDatabase(this.dbName);
                deleteRequest.onsuccess = () => {
                    console.log('Database deleted successfully');
                    // Crear nueva base de datos
                    request = indexedDB.open(this.dbName, this.dbVersion);
                    this.setupDatabaseHandlers(request, resolve, reject);
                };
                deleteRequest.onerror = () => {
                    console.warn('Could not delete database');
                    // Intentar abrir la base de datos de todos modos
                    request = indexedDB.open(this.dbName, this.dbVersion);
                    this.setupDatabaseHandlers(request, resolve, reject);
                };
            } catch (error) {
                reject(new Error('Failed to initialize database: ' + error.message));
            }
        });
    }

    setupDatabaseHandlers(request, resolve, reject) {
        request.onerror = (event) => {
            console.error('Database error:', event.target.error);
            reject(event.target.error);
        };

        request.onblocked = (event) => {
            console.warn('Database blocked:', event);
            reject(new Error('Database blocked'));
        };

        request.onupgradeneeded = (event) => {
            console.log('Database upgrade needed');
            const db = event.target.result;
            
            // Eliminar el object store existente si existe
            if (db.objectStoreNames.contains(this.storeName)) {
                db.deleteObjectStore(this.storeName);
            }
            
            // Crear nuevo object store
            const store = db.createObjectStore(this.storeName, { 
                keyPath: 'id',
                autoIncrement: true 
            });
            store.createIndex('date', 'date', { unique: false });
            store.createIndex('email', 'email', { unique: false });
            console.log('Object store created successfully');
        };

        request.onsuccess = (event) => {
            this.db = event.target.result;
            console.log('Database opened successfully');
            
            this.db.onerror = (event) => {
                console.error('Database error:', event.target.error);
            };
            
            resolve(this.db);
        };
    }

    initializeEventListeners() {
        const searchInput = document.getElementById('search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value;
                this.filterMessages();
            });
        }

        const filterStatus = document.getElementById('filter-status');
        if (filterStatus) {
            filterStatus.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.filterMessages();
            });
        }

        const dateFilter = document.getElementById('date-filter');
        if (dateFilter) {
            dateFilter.addEventListener('change', (e) => {
                this.selectedDate = e.target.value;
                this.filterMessages();
            });
        }

        const backupBtn = document.getElementById('backup-btn');
        if (backupBtn) {
            backupBtn.addEventListener('click', () => this.createBackup());
        }

        const syncBtn = document.getElementById('sync-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => this.syncWithIndexedDB());
        }
    }

    async getMessagesFromIndexedDB() {
        try {
            if (!this.db) {
                await this.initializeDB();
            }

            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.getAll();

                request.onsuccess = async () => {
                    try {
                        const messages = await Promise.all(
                            request.result.map(async (message) => {
                                if (message.encryptedData) {
                                    const decryptedData = await this.security.decryptData(
                                        new Uint8Array(message.encryptedData)
                                    );
                                    return {
                                        ...decryptedData,
                                        id: message.id,
                                        date: message.date,
                                        read: message.read
                                    };
                                }
                                return message;
                            })
                        );
                        resolve(messages);
                    } catch (error) {
                        console.error('Error decrypting messages:', error);
                        reject(error);
                    }
                };

                request.onerror = () => {
                    reject(request.error);
                };
            });
        } catch (error) {
            console.error('Failed to get messages from IndexedDB:', error);
            throw error;
        }
    }

    async loadMessages() {
        try {
            const localMessages = await this.getMessagesFromIndexedDB();
            this.messages = localMessages || [];
            this.updateMessagesList();

            try {
                const response = await fetch(`${this.apiBaseUrl}/messages`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const serverMessages = await response.json();
                
                // Encriptar y guardar los mensajes del servidor
                const encryptedMessages = await Promise.all(
                    serverMessages.map(async (message) => {
                        const encryptedData = await this.security.encryptData({
                            name: message.name,
                            email: message.email,
                            message: message.message
                        });
                        return {
                            encryptedData: Array.from(encryptedData),
                            date: message.date,
                            read: message.read,
                            id: message.id
                        };
                    })
                );

                await this.syncMessagesWithIndexedDB(encryptedMessages);
                
                // Actualizar la lista con los mensajes desencriptados
                this.messages = serverMessages;
                this.updateMessagesList();
            } catch (error) {
                console.warn('Could not fetch from server, using local data:', error);
            }
        } catch (error) {
            console.error('Error loading messages:', error);
            this.showError('Failed to load messages: ' + error.message);
        }
    }

    updateMessagesList() {
        const messagesList = document.getElementById('messages-list');
        if (!messagesList) {
            console.error('Messages list element not found');
            return;
        }

        messagesList.innerHTML = '';
        const filteredMessages = this.getFilteredMessages();

        filteredMessages.forEach(message => {
            const messageElement = this.createMessageElement(message);
            messagesList.appendChild(messageElement);
        });

        this.updateStats();
    }

    createMessageElement(message) {
        const div = document.createElement('div');
        div.className = `message ${message.read ? 'read' : 'unread'}`;
        div.innerHTML = `
            <div class="message-header">
                <span class="message-date">${new Date(message.date).toLocaleString()}</span>
                <span class="message-email">${this.escapeHtml(message.email)}</span>
            </div>
            <div class="message-content">
                <strong>${this.escapeHtml(message.name)}</strong>
                <p>${this.escapeHtml(message.message)}</p>
            </div>
            <div class="message-actions">
                <button onclick="adminPanel.toggleMessageRead(${message.id})">${message.read ? 'Mark Unread' : 'Mark Read'}</button>
            </div>
        `;
        return div;
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    getFilteredMessages() {
        return this.messages.filter(message => {
            const matchesSearch = !this.searchQuery || 
                message.email.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                message.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
                message.message.toLowerCase().includes(this.searchQuery.toLowerCase());

            const matchesFilter = this.currentFilter === 'all' ||
                (this.currentFilter === 'read' && message.read) ||
                (this.currentFilter === 'unread' && !message.read);

            const matchesDate = !this.selectedDate ||
                new Date(message.date).toLocaleDateString() === new Date(this.selectedDate).toLocaleDateString();

            return matchesSearch && matchesFilter && matchesDate;
        });
    }

    updateStats() {
        const statsElement = document.getElementById('stats');
        if (!statsElement) return;

        const total = this.messages.length;
        const unread = this.messages.filter(m => !m.read).length;
        const read = total - unread;

        statsElement.innerHTML = `
            <p>Total: ${total}</p>
            <p>Read: ${read}</p>
            <p>Unread: ${unread}</p>
        `;
    }

    async toggleMessageRead(id) {
        try {
            const message = this.messages.find(m => m.id === id);
            if (!message) return;

            message.read = !message.read;

            // Actualizar en el servidor
            const response = await fetch(`${this.apiBaseUrl}/messages/${id}/read`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ read: message.read })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Actualizar en IndexedDB
            const encryptedData = await this.security.encryptData({
                name: message.name,
                email: message.email,
                message: message.message
            });

            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            
            await new Promise((resolve, reject) => {
                const request = store.put({
                    id: message.id,
                    encryptedData: Array.from(encryptedData),
                    date: message.date,
                    read: message.read
                });
                
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });

            this.updateMessagesList();
        } catch (error) {
            console.error('Error toggling message read status:', error);
            this.showError('Failed to update message status: ' + error.message);
        }
    }

    async syncMessagesWithIndexedDB(encryptedMessages) {
        try {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            await new Promise((resolve, reject) => {
                const clearRequest = store.clear();
                clearRequest.onsuccess = () => resolve();
                clearRequest.onerror = () => reject(clearRequest.error);
            });

            for (const message of encryptedMessages) {
                await new Promise((resolve, reject) => {
                    const request = store.add(message);
                    request.onsuccess = () => resolve();
                    request.onerror = () => reject(request.error);
                });
            }

            console.log('Successfully synced messages with IndexedDB');
        } catch (error) {
            console.error('Error syncing with IndexedDB:', error);
            throw new Error('Failed to sync with IndexedDB: ' + error.message);
        }
    }

    showError(message) {
        const errorElement = document.getElementById('error-message');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
            setTimeout(() => {
                errorElement.style.display = 'none';
            }, 5000);
        } else {
            console.error(message);
        }
    }

    async ensureDbConnection() {
        if (!this.db) {
            await this.initializeDB();
        }
        return this.db;
    }

    async createBackup() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/backup`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            document.getElementById('last-backup').textContent = 
                new Date().toLocaleString();
            this.showSuccess('Backup created successfully');
        } catch (error) {
            console.error('Error creating backup:', error);
            this.showError('Failed to create backup: ' + error.message);
        }
    }

    async syncWithIndexedDB() {
        try {
            const db = await this.openIndexedDB();
            const messages = await this.getAllIndexedDBMessages(db);
            
            if (messages.length === 0) {
                this.showSuccess('No new messages to sync');
                return;
            }

            const response = await fetch(`${this.apiBaseUrl}/messages/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(messages)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            this.showSuccess(`Sync completed: ${result.addedMessages.length} messages added`);
            await this.loadMessages();
        } catch (error) {
            console.error('Error syncing with IndexedDB:', error);
            this.showError('Failed to sync with IndexedDB: ' + error.message);
        }
    }

    openIndexedDB() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                resolve(this.db);
                return;
            }

            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { 
                        keyPath: 'id',
                        autoIncrement: true 
                    });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('email', 'email', { unique: false });
                }
            };
        });
    }

    getAllIndexedDBMessages(db) {
        return new Promise((resolve, reject) => {
            try {
                const transaction = db.transaction([this.storeName], 'readonly');
                const store = transaction.objectStore(this.storeName);
                const request = store.getAll();
                
                request.onerror = () => reject(request.error);
                request.onsuccess = () => resolve(request.result);
            } catch (error) {
                reject(new Error('Failed to access IndexedDB store: ' + error.message));
            }
        });
    }

    showSuccess(message) {
        alert(message);
    }
}

class AdminPanelNew {
    constructor() {
        this.messages = [];
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.selectedDate = '';
        this.apiBaseUrl = 'http://localhost:3000/api';
        
        // Initialize when DOM is loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initialize());
        } else {
            this.initialize();
        }
    }

    async initialize() {
        this.initializeEventListeners();
        await this.loadMessages();
    }

    initializeEventListeners() {
        // Search functionality
        const searchInput = document.getElementById('search');
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.updateMessagesList();
        });

        // Filter functionality
        const filterSelect = document.getElementById('filter-status');
        filterSelect.addEventListener('change', (e) => {
            this.currentFilter = e.target.value;
            this.updateMessagesList();
        });

        // Date filter
        const dateFilter = document.getElementById('date-filter');
        dateFilter.addEventListener('change', (e) => {
            this.selectedDate = e.target.value;
            this.updateMessagesList();
        });

        // Sync button
        const syncBtn = document.getElementById('sync-btn');
        syncBtn.addEventListener('click', () => this.loadMessages());

        // Backup button
        const backupBtn = document.getElementById('backup-btn');
        backupBtn.addEventListener('click', () => this.createBackup());
    }

    async loadMessages() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/messages`);
            if (!response.ok) {
                throw new Error('Failed to fetch messages');
            }
            
            this.messages = await response.json();
            this.updateMessagesList();
            this.updateStats();
            this.showSuccess('Messages loaded successfully');
        } catch (error) {
            console.error('Error loading messages:', error);
            this.showError('Failed to load messages');
        }
    }

    updateMessagesList() {
        const messagesList = document.getElementById('messages-list');
        const filteredMessages = this.getFilteredMessages();
        
        messagesList.innerHTML = '';
        
        if (filteredMessages.length === 0) {
            messagesList.innerHTML = '<div class="no-messages">No messages found</div>';
            return;
        }

        filteredMessages.forEach(message => {
            const messageElement = this.createMessageElement(message);
            messagesList.appendChild(messageElement);
        });
    }

    createMessageElement(message) {
        const div = document.createElement('div');
        div.className = `message ${message.read ? 'read' : 'unread'}`;
        div.innerHTML = `
            <div class="message-header">
                <span class="name">${this.escapeHtml(message.name)}</span>
                <span class="email">${this.escapeHtml(message.email)}</span>
                <span class="date">${new Date(message.date).toLocaleString()}</span>
            </div>
            <div class="message-content">${this.escapeHtml(message.message)}</div>
            <div class="message-footer">
                <button class="toggle-read" data-id="${message.id}">
                    ${message.read ? 'Mark as Unread' : 'Mark as Read'}
                </button>
            </div>
        `;

        const toggleButton = div.querySelector('.toggle-read');
        toggleButton.addEventListener('click', () => this.toggleMessageRead(message.id));

        return div;
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    getFilteredMessages() {
        return this.messages.filter(message => {
            // Status filter
            if (this.currentFilter === 'read' && !message.read) return false;
            if (this.currentFilter === 'unread' && message.read) return false;

            // Search filter
            if (this.searchQuery) {
                const searchFields = `${message.name} ${message.email} ${message.message}`.toLowerCase();
                if (!searchFields.includes(this.searchQuery)) return false;
            }

            // Date filter
            if (this.selectedDate) {
                const messageDate = new Date(message.date).toISOString().split('T')[0];
                if (messageDate !== this.selectedDate) return false;
            }

            return true;
        });
    }

    updateStats() {
        const totalMessages = this.messages.length;
        const readMessages = this.messages.filter(m => m.read).length;
        const unreadMessages = totalMessages - readMessages;

        const statsElement = document.getElementById('stats');
        statsElement.innerHTML = `
            <p>Total: ${totalMessages}</p>
            <p>Read: ${readMessages}</p>
            <p>Unread: ${unreadMessages}</p>
        `;
    }

    async toggleMessageRead(id) {
        try {
            const message = this.messages.find(m => m.id === id);
            if (!message) return;

            const newReadStatus = !message.read;
            
            const response = await fetch(`${this.apiBaseUrl}/messages/${id}/read`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ read: newReadStatus })
            });

            if (!response.ok) {
                throw new Error('Failed to update message status');
            }

            message.read = newReadStatus;
            this.updateMessagesList();
            this.updateStats();
        } catch (error) {
            console.error('Error toggling message status:', error);
            this.showError('Failed to update message status');
        }
    }

    async createBackup() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/backup`, {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error('Failed to create backup');
            }

            const result = await response.json();
            this.showSuccess('Backup created successfully');
        } catch (error) {
            console.error('Error creating backup:', error);
            this.showError('Failed to create backup');
        }
    }

    showError(message) {
        const errorElement = document.getElementById('error-message');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 3000);
    }

    showSuccess(message) {
        const errorElement = document.getElementById('error-message');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        errorElement.style.backgroundColor = '#4CAF50';
        setTimeout(() => {
            errorElement.style.display = 'none';
            errorElement.style.backgroundColor = '#f44336';
        }, 3000);
    }
}

// Initialize admin panel
const adminPanel = new AdminPanelNew();
