// Catalog and Queue Management

const Catalog = {
    currentPath: '',
    queue: [],
    isPlaying: false,

    async init() {
        this.setupEventListeners();
        await this.loadQueue();
        await this.loadCatalog();
        await this.checkPlaybackState();

        // Poll playback state and queue periodically
        setInterval(() => this.checkPlaybackState(), 2000);
        setInterval(() => this.loadQueue(), 5000);
    },

    async loadQueue() {
        try {
            const response = await fetch('/api/v1/playback/queue');
            const data = await response.json();
            this.queue = data.queue || [];
            this.renderQueue();
        } catch (e) {
            console.error('Failed to load queue:', e);
        }
    },

    async checkPlaybackState() {
        try {
            const response = await fetch('/api/v1/playback');
            const data = await response.json();
            const wasPlaying = this.isPlaying;
            this.isPlaying = data.state === 'playing' || data.state === 'paused';

            // Update now playing display
            if (data.file_name) {
                document.getElementById('now-playing').textContent = data.file_name;
            }

            // Auto-advance queue when song ends
            if (wasPlaying && data.state === 'stopped' && this.queue.length > 0) {
                await this.playNext();
            }
        } catch (error) {
            // Ignore errors
        }
    },

    setupEventListeners() {
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
        });

        // Search
        const searchBtn = document.getElementById('search-btn');
        const searchInput = document.getElementById('catalog-search');

        searchBtn.addEventListener('click', () => this.search(searchInput.value));
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.search(searchInput.value);
        });

        // Queue controls
        document.getElementById('shuffle-btn').addEventListener('click', () => this.shuffleQueue());
        document.getElementById('clear-queue-btn').addEventListener('click', () => this.clearQueue());

        // Skip button
        const skipBtn = document.getElementById('skip-btn');
        if (skipBtn) {
            skipBtn.addEventListener('click', () => this.playNext());
        }
    },

    switchTab(tabId) {
        // Update buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        // Update content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === tabId + '-tab');
        });
    },

    async loadCatalog(path = '') {
        this.currentPath = path;

        try {
            const url = path
                ? `/api/v1/catalog?path=${encodeURIComponent(path)}`
                : '/api/v1/catalog';

            const response = await fetch(url);
            const data = await response.json();

            this.renderCatalog(data);
            this.updateBreadcrumb(path);
            this.updateCount(data.total_files, data.directories.length);
        } catch (error) {
            console.error('Failed to load catalog:', error);
        }
    },

    async search(query) {
        if (!query.trim()) {
            this.loadCatalog(this.currentPath);
            return;
        }

        try {
            const response = await fetch(`/api/v1/catalog/search?q=${encodeURIComponent(query)}&limit=100`);
            const data = await response.json();

            this.renderSearchResults(data.results);
            this.updateCount(data.total, 0);
        } catch (error) {
            console.error('Search failed:', error);
        }
    },

    renderCatalog(data) {
        const dirsContainer = document.getElementById('catalog-dirs');
        const filesContainer = document.getElementById('catalog-files');

        // Render directories
        if (data.directories.length > 0) {
            dirsContainer.innerHTML = data.directories.map(dir => `
                <div class="catalog-dir" data-path="${dir.path}">
                    <span class="dir-icon">📁</span>
                    <span class="dir-name">${dir.name}</span>
                    <span class="dir-count">${dir.file_count} files</span>
                    <button class="queue-folder-btn" data-path="${dir.path}" data-name="${dir.name}">Queue All</button>
                </div>
            `).join('');

            dirsContainer.querySelectorAll('.catalog-dir').forEach(el => {
                el.addEventListener('click', (e) => {
                    // Don't navigate if clicking the queue button
                    if (e.target.classList.contains('queue-folder-btn')) return;
                    this.loadCatalog(el.dataset.path);
                });
            });

            dirsContainer.querySelectorAll('.queue-folder-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.addFolderToQueue(btn.dataset.path, btn.dataset.name);
                });
            });
        } else {
            dirsContainer.innerHTML = '';
        }

        // Render files
        if (data.files.length > 0) {
            filesContainer.innerHTML = data.files.map(file => `
                <div class="catalog-file" data-id="${file.id}">
                    <div class="file-info">
                        <span class="file-name">${file.name}</span>
                        <span class="file-meta">${file.extension} - ${this.formatSize(file.size)}</span>
                    </div>
                    <div class="file-actions">
                        <button class="play-btn" data-id="${file.id}">Play</button>
                        <button class="queue-btn" data-id="${file.id}" data-name="${file.name}">Add</button>
                    </div>
                </div>
            `).join('');

            filesContainer.querySelectorAll('.play-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.playFile(btn.dataset.id, true);
                });
            });

            filesContainer.querySelectorAll('.queue-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.addToQueue(btn.dataset.id, btn.dataset.name);
                });
            });
        } else if (data.directories.length === 0) {
            filesContainer.innerHTML = '<p class="empty-message">No files in this directory</p>';
        } else {
            filesContainer.innerHTML = '';
        }
    },

    renderSearchResults(results) {
        const dirsContainer = document.getElementById('catalog-dirs');
        const filesContainer = document.getElementById('catalog-files');

        dirsContainer.innerHTML = '';

        if (results.length > 0) {
            filesContainer.innerHTML = results.map(file => `
                <div class="catalog-file" data-id="${file.id}">
                    <div class="file-info">
                        <span class="file-name">${file.name}</span>
                        <span class="file-meta">${file.directory || 'Root'} - ${file.extension}</span>
                    </div>
                    <div class="file-actions">
                        <button class="play-btn" data-id="${file.id}">Play</button>
                        <button class="queue-btn" data-id="${file.id}" data-name="${file.name}">Add</button>
                    </div>
                </div>
            `).join('');

            filesContainer.querySelectorAll('.play-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.playFile(btn.dataset.id, true);
                });
            });

            filesContainer.querySelectorAll('.queue-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.addToQueue(btn.dataset.id, btn.dataset.name);
                });
            });
        } else {
            filesContainer.innerHTML = '<p class="empty-message">No results found</p>';
        }
    },

    updateBreadcrumb(path) {
        const container = document.getElementById('breadcrumb');
        const parts = path ? path.split('/') : [];

        let html = '<span class="crumb" data-path="">Home</span>';
        let currentPath = '';

        parts.forEach((part, i) => {
            currentPath += (i > 0 ? '/' : '') + part;
            html += ` <span class="separator">/</span> <span class="crumb" data-path="${currentPath}">${part}</span>`;
        });

        container.innerHTML = html;

        container.querySelectorAll('.crumb').forEach(el => {
            el.addEventListener('click', () => this.loadCatalog(el.dataset.path));
        });
    },

    updateCount(files, dirs) {
        const el = document.getElementById('catalog-count');
        if (dirs > 0) {
            el.textContent = `${dirs} folders, ${files} files`;
        } else {
            el.textContent = `${files} files`;
        }
    },

    async playFile(fileId, switchToPlayer = false) {
        try {
            const response = await fetch(`/api/v1/catalog/${encodeURIComponent(fileId)}/play`, {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                this.isPlaying = true;
                document.getElementById('now-playing').textContent = data.file;

                // Only switch tab if explicitly requested (Play button, not queue auto-play)
                if (switchToPlayer) {
                    this.switchTab('piano');
                }
            }
        } catch (error) {
            console.error('Failed to play file:', error);
        }
    },

    async addToQueue(fileId, fileName) {
        try {
            const response = await fetch('/api/v1/playback/queue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: fileId, name: fileName })
            });
            const data = await response.json();

            if (data.success) {
                this.queue = data.queue;
                this.renderQueue();
                this.showToast(`Added "${fileName}" to queue`);
            } else {
                this.showToast(data.message || 'Already in queue');
            }
        } catch (e) {
            console.error('Failed to add to queue:', e);
        }
    },

    async addFolderToQueue(folderPath, folderName) {
        try {
            // Fetch all files in this folder
            const url = `/api/v1/catalog?path=${encodeURIComponent(folderPath)}`;
            const response = await fetch(url);
            const data = await response.json();

            if (!data.files || data.files.length === 0) {
                this.showToast(`No files in "${folderName}"`);
                return;
            }

            // Sort files by name to ensure correct order
            const files = data.files.sort((a, b) => a.name.localeCompare(b.name));

            // Add all files to queue
            let addedCount = 0;
            for (const file of files) {
                const addResponse = await fetch('/api/v1/playback/queue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: file.id, name: file.name })
                });
                const addData = await addResponse.json();
                if (addData.success) {
                    addedCount++;
                    this.queue = addData.queue;
                }
            }

            this.renderQueue();
            this.showToast(`Added ${addedCount} files from "${folderName}" to queue`);
        } catch (e) {
            console.error('Failed to add folder to queue:', e);
            this.showToast('Failed to add folder to queue');
        }
    },

    showToast(message) {
        // Create toast element if it doesn't exist
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.remove('show');
        }, 2000);
    },

    async removeFromQueue(index) {
        try {
            const response = await fetch(`/api/v1/playback/queue/${index}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            this.queue = data.queue;
            this.renderQueue();
        } catch (e) {
            console.error('Failed to remove from queue:', e);
        }
    },

    async shuffleQueue() {
        try {
            const response = await fetch('/api/v1/playback/queue/shuffle', {
                method: 'POST'
            });
            const data = await response.json();
            this.queue = data.queue;
            this.renderQueue();
        } catch (e) {
            console.error('Failed to shuffle queue:', e);
        }
    },

    async clearQueue() {
        try {
            const response = await fetch('/api/v1/playback/queue', {
                method: 'DELETE'
            });
            const data = await response.json();
            this.queue = data.queue;
            this.renderQueue();
        } catch (e) {
            console.error('Failed to clear queue:', e);
        }
    },

    async playNext() {
        try {
            const response = await fetch('/api/v1/playback/queue/next', {
                method: 'POST'
            });
            const data = await response.json();

            if (data.success) {
                this.queue = data.queue;
                this.isPlaying = true;
                document.getElementById('now-playing').textContent = data.playing.name;
                this.renderQueue();
            }
        } catch (e) {
            console.error('Failed to play next:', e);
        }
    },

    renderQueue() {
        const container = document.getElementById('queue-list');

        if (this.queue.length === 0) {
            container.innerHTML = '<p class="empty-message">Queue is empty. Add songs from the catalog below.</p>';
            return;
        }

        container.innerHTML = this.queue.map((item, index) => `
            <div class="queue-item">
                <span class="queue-number">${index + 1}</span>
                <span class="queue-name">${item.name}</span>
                <div class="queue-actions">
                    <button class="play-now-btn" data-index="${index}">Play</button>
                    <button class="remove-btn" data-index="${index}">X</button>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => this.removeFromQueue(parseInt(btn.dataset.index)));
        });

        container.querySelectorAll('.play-now-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const index = parseInt(btn.dataset.index);
                const item = this.queue[index];
                await this.removeFromQueue(index);
                await this.playFile(item.id, true);
            });
        });
    },

    formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    Catalog.init();
});
