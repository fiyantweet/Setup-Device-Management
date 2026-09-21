// ==========================================
// KONEKSI SUPABASE & HYBRID FALLBACK
// ==========================================
const SUPABASE_URL = 'https://xnfdvmxbklqelwvxzygp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuZmR2bXhia2xxZWx3dnh6eWdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NDgwMzQsImV4cCI6MjEwNTIyNDAzNH0.c6rY_GA0vBjGMnUQc9xDPKSYC1sB1fNiYZU1kVbKt2Q';

let supabaseClient = null;
let isLocalMode = false;

// Cek apakah Supabase diisi. Jika belum, gunakan LocalStorage (agar tombol Login tidak mati)
if (SUPABASE_URL.includes('ISI_DENGAN')) {
    isLocalMode = true;
    console.warn("Supabase belum disetting. Aplikasi berjalan di mode LocalStorage agar tetap berfungsi 100%.");
} else {
    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
        isLocalMode = true;
        console.error("Gagal konek Supabase, beralih ke LocalMode.", e);
    }
}

// Inisialisasi Data Dummy LocalStorage Jika Kosong
if (isLocalMode && !localStorage.getItem('cloud_users')) {
    localStorage.setItem('cloud_users', JSON.stringify([
        { id: 1, username: 'admin', password: 'admin123', role: 'Admin', is_2fa_setup: false },
        { id: 2, username: 'member', password: 'member123', role: 'Member', is_2fa_setup: false }
    ]));
}

let currentUser = null;

// ==========================================
// INISIALISASI (CEK SESI PERSISTEN) & SHORTCUT ENTER
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    // Jika browser direfresh, cek apakah masih login
    const savedSession = localStorage.getItem('autopilot_session');
    if (savedSession) {
        currentUser = JSON.parse(savedSession);
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        initApp();
    }

    // Aktifkan Fungsi Tombol Enter
    const addEnterEvent = (id, action) => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('keypress', e => { if(e.key === 'Enter') action(); });
    };

    addEnterEvent('login-user', () => document.getElementById('login-pass').focus());
    addEnterEvent('login-pass', handleLogin);
    addEnterEvent('mfa-code', handle2FA);
    addEnterEvent('reset-user', () => document.getElementById('reset-pass').focus());
    addEnterEvent('reset-pass', handleReset);
    addEnterEvent('search-input', searchDevice);
});

// ==========================================
// 1. AUTENTIKASI, LOGIN & RESET
// ==========================================
function toggleAuth(view) {
    document.getElementById('login-card').classList.add('hidden');
    document.getElementById('mfa-card').classList.add('hidden');
    document.getElementById('reset-card').classList.add('hidden');
    document.getElementById(`${view}-card`).classList.remove('hidden');
}

function fillDemoAccount() {
    document.getElementById('login-user').value = 'admin';
    document.getElementById('login-pass').value = 'admin123';
    document.getElementById('login-pass').focus();
}

async function handleLogin() {
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    
    if (!user || !pass) return alert("Username dan Password wajib diisi!");

    let foundUser = null;

    if (isLocalMode) {
        const users = JSON.parse(localStorage.getItem('cloud_users')) || [];
        foundUser = users.find(u => u.username === user && u.password === pass);
    } else {
        const { data } = await supabaseClient.from('app_users').select('*').eq('username', user).eq('password', pass);
        if (data && data.length > 0) foundUser = data[0];
    }

    if (!foundUser) {
        alert("Login Gagal: Username atau Password salah!");
        return;
    }

    currentUser = foundUser;
    toggleAuth('mfa');
    prepareAuthenticator(currentUser);
    setTimeout(() => document.getElementById('mfa-code').focus(), 100);
}

function prepareAuthenticator(account) {
    const qrContainer = document.getElementById('qr-container');
    const qrDiv = document.getElementById('qrcode');
    const instruction = document.getElementById('mfa-instruction');
    qrDiv.innerHTML = ''; 

    if (!account.is_2fa_setup) {
        qrContainer.classList.remove('hidden');
        instruction.innerText = "SETUP PERTAMA: Buka Authenticator dan Scan Barcode ini.";
        const appName = "AutoPilot_Cloud";
        const otpUrl = `otpauth://totp/${appName}:${account.username}?secret=JBSWY3DPEHPK3PXP&issuer=${appName}`;
        new QRCode(qrDiv, { text: otpUrl, width: 140, height: 140, colorDark: "#000", colorLight: "#ffffff" });
    } else {
        qrContainer.classList.add('hidden');
        instruction.innerText = "Masukkan 6 digit kode dari aplikasi Authenticator Anda.";
    }
}

async function handle2FA() {
    const code = document.getElementById('mfa-code').value.trim();
    
    if (code.length === 6 && !isNaN(code)) {
        if (!currentUser.is_2fa_setup) {
            currentUser.is_2fa_setup = true;
            if (isLocalMode) {
                const users = JSON.parse(localStorage.getItem('cloud_users'));
                const idx = users.findIndex(u => u.id === currentUser.id);
                users[idx].is_2fa_setup = true;
                localStorage.setItem('cloud_users', JSON.stringify(users));
            } else {
                await supabaseClient.from('app_users').update({ is_2fa_setup: true }).eq('id', currentUser.id);
            }
        }

        // SIMPAN SESI AGAR TIDAK LOGOUT SAAT REFRESH
        localStorage.setItem('autopilot_session', JSON.stringify(currentUser));

        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        initApp();
    } else {
        alert("Kode 2FA tidak valid! Harap masukkan 6 digit angka.");
    }
}

async function handleReset() {
    const user = document.getElementById('reset-user').value.trim();
    const newPass = document.getElementById('reset-pass').value.trim();
    
    if(!user || !newPass) return alert("Harap isi Username dan Password Baru!");

    let isSuccess = false;
    if (isLocalMode) {
        const users = JSON.parse(localStorage.getItem('cloud_users')) || [];
        const idx = users.findIndex(u => u.username === user);
        if(idx > -1) {
            users[idx].password = newPass;
            localStorage.setItem('cloud_users', JSON.stringify(users));
            isSuccess = true;
        }
    } else {
        const { data } = await supabaseClient.from('app_users').update({ password: newPass }).eq('username', user).select();
        if(data && data.length > 0) isSuccess = true;
    }

    if (isSuccess) {
        alert("Reset Password Berhasil! Silakan login kembali.");
        toggleAuth('login');
    } else {
        alert("Gagal: Username tidak ditemukan di database.");
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('autopilot_session'); 
    document.getElementById('app-section').classList.add('hidden');
    document.getElementById('auth-section').classList.remove('hidden');
    document.querySelectorAll('.input-form').forEach(el => el.value = '');
    toggleAuth('login');
}

// ==========================================
// 2. DASHBOARD & STATISTIK KLIK FILTER
// ==========================================
async function initApp() {
    document.getElementById('login-role-badge').innerText = `[ ${currentUser.role} ]`;

    if(currentUser.role === 'Admin') {
        document.getElementById('tab-btn-admin').style.display = 'inline-block';
        renderUsers();
    } else {
        document.getElementById('tab-btn-admin').style.display = 'none';
        switchTab('device');
    }

    await renderDevices();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.currentTarget.classList.add('active');
}

// Fungsi Klik Pada Kartu Statistik (Total Device dll)
function setStatFilter(status) {
    document.getElementById('filter-status-select').value = status;
    renderDevices();
}

async function updateDashboardStats(devicesList) {
    document.getElementById('stat-total').innerText = devicesList.length;
    document.getElementById('stat-belum').innerText = devicesList.filter(d => d.status === 'Belum di setup').length;
    document.getElementById('stat-progress').innerText = devicesList.filter(d => d.status === 'On progress').length;
    document.getElementById('stat-setup').innerText = devicesList.filter(d => d.status === 'Done setup').length;
    document.getElementById('stat-deploy').innerText = devicesList.filter(d => d.status === 'Done deploy user').length;
}

// Format Tanggal jadi: Hari, DD Bulan YYYY (Contoh: Senin, 21 September 2026)
function formatTanggalIndo(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if(parts.length !== 3) return dateStr;
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);
    const dObj = new Date(year, month, day);
    
    const hari = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][dObj.getDay()];
    const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'][month];
    
    return `${hari}, ${day} ${bulan} ${year}`;
}

// ==========================================
// 3. CRUD DEVICES, FILTER & PENCARIAN
// ==========================================
function getStatusBadge(status) {
    if(status === 'Belum di setup') return `<span class="badge badge-belum">${status}</span>`;
    if(status === 'On progress') return `<span class="badge badge-progress">${status}</span>`;
    if(status === 'Done setup') return `<span class="badge badge-setup">${status}</span>`;
    if(status === 'Done deploy user') return `<span class="badge badge-deploy">${status}</span>`;
    return status;
}

async function fetchDevices() {
    if (isLocalMode) return JSON.parse(localStorage.getItem('cloud_devices')) || [];
    const { data } = await supabaseClient.from('devices').select('*');
    return data || [];
}

async function renderDevices() {
    const rawDevices = await fetchDevices();
    updateDashboardStats(rawDevices); // Update statistik berdasarkan seluruh data

    const tbody = document.getElementById('table-device');
    tbody.innerHTML = '';

    let list = [...rawDevices];

    // Filter by Dropdown Status (Atau hasil klik kartu stat)
    const filterStatus = document.getElementById('filter-status-select').value;
    if (filterStatus !== 'All') {
        list = list.filter(d => d.status === filterStatus);
    }

    // Filter by Search (Nama, SN, Email)
    const searchVal = document.getElementById('search-input').value.toLowerCase().trim();
    if (searchVal) {
        list = list.filter(d => 
            (d.nama && d.nama.toLowerCase().includes(searchVal)) || 
            (d.sn && d.sn.toLowerCase().includes(searchVal)) ||
            (d.email && d.email.toLowerCase().includes(searchVal))
        );
    }

    // Sort by Date
    const sortDate = document.getElementById('sort-date-select').value;
    list.sort((a, b) => {
        const dateA = a.tanggal || '';
        const dateB = b.tanggal || '';
        return sortDate === 'newest' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
    });

    list.forEach(d => {
        // Tampilkan hanya update status paling akhir
        const historyHtml = d.history ? `<div class="history-box">${d.history}</div>` : '-';
        
        tbody.innerHTML += `
            <tr>
                <td><strong>${d.nama || '-'}</strong></td>
                <td>${d.sn || '-'}</td>
                <td>${d.email || '-'}</td>
                <td>${d.alamat || '-'}</td>
                <td style="color:var(--primary); font-weight:bold;">${formatTanggalIndo(d.tanggal)}</td>
                <td>${getStatusBadge(d.status)}</td>
                <td>${historyHtml}</td>
                <td>
                    <button class="btn btn-warning" style="padding:5px 10px; font-size:11px;" onclick="editDevice(${d.id})">Edit</button>
                    <button class="btn btn-danger" style="padding:5px 10px; font-size:11px;" onclick="deleteDevice(${d.id})">Hapus</button>
                </td>
            </tr>
        `;
    });
}

function searchDevice() {
    renderDevices();
}

async function saveDevice() {
    const id = document.getElementById('dev-id').value;
    const nama = document.getElementById('dev-nama').value;
    const sn = document.getElementById('dev-sn').value;
    const email = document.getElementById('dev-email').value;
    const alamat = document.getElementById('dev-alamat').value;
    const tanggal = document.getElementById('dev-tgl').value;
    const status = document.getElementById('dev-status').value;

    if (!tanggal) return alert("Silakan pilih Tanggal Deploy dari Kalender!");

    const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

    let newHistory = '';
    const payload = { nama, sn, email, alamat, tanggal, status };

    if (id) {
        // Mode Update
        const devices = await fetchDevices();
        const oldData = devices.find(d => d.id == id);
        
        // Logika Riwayat Update Spesifik (Sebelum & Sesudah)
        if (oldData && oldData.status !== status) {
            newHistory = `Status: <span style="color:var(--warning)">${oldData.status}</span> ➔ <span style="color:var(--success)">${status}</span><br><small style="color:var(--text-muted)">Update: ${nowStr}</small>`;
        } else if (oldData) {
            newHistory = `Data diperbarui (Tanpa ubah status)<br><small style="color:var(--text-muted)">Update: ${nowStr}</small>`;
        }
        
        payload.history = newHistory;

        if (isLocalMode) {
            const idx = devices.findIndex(d => d.id == id);
            devices[idx] = { ...devices[idx], ...payload };
            localStorage.setItem('cloud_devices', JSON.stringify(devices));
        } else {
            await supabaseClient.from('devices').update(payload).eq('id', id);
        }
    } else {
        // Mode Insert Baru
        payload.history = `Data Dibuat Baru<br><small style="color:var(--text-muted)">${nowStr}</small>`;
        if (isLocalMode) {
            const devices = await fetchDevices();
            payload.id = Date.now();
            devices.push(payload);
            localStorage.setItem('cloud_devices', JSON.stringify(devices));
        } else {
            await supabaseClient.from('devices').insert([payload]);
        }
    }
    
    closeModal('modal-device');
    renderDevices();
}

async function editDevice(id) {
    const devices = await fetchDevices();
    const data = devices.find(d => d.id == id);
    if(data) {
        document.getElementById('title-device').innerText = 'Edit Data & Status Deploy';
        document.getElementById('dev-id').value = data.id;
        document.getElementById('dev-nama').value = data.nama;
        document.getElementById('dev-sn').value = data.sn;
        document.getElementById('dev-email').value = data.email;
        document.getElementById('dev-alamat').value = data.alamat;
        document.getElementById('dev-tgl').value = data.tanggal;
        document.getElementById('dev-status').value = data.status;
        document.getElementById('modal-device').classList.remove('hidden');
    }
}

async function deleteDevice(id) {
    if(confirm("Yakin ingin menghapus data device ini?")) {
        if(isLocalMode) {
            let devices = await fetchDevices();
            devices = devices.filter(d => d.id != id);
            localStorage.setItem('cloud_devices', JSON.stringify(devices));
        } else {
            await supabaseClient.from('devices').delete().eq('id', id);
        }
        renderDevices();
    }
}

// ==========================================
// 4. CRUD USERS (ADMIN SAJA)
// ==========================================
async function fetchUsers() {
    if (isLocalMode) return JSON.parse(localStorage.getItem('cloud_users')) || [];
    const { data } = await supabaseClient.from('app_users').select('*');
    return data || [];
}

async function renderUsers() {
    const users = await fetchUsers();
    const tbody = document.getElementById('table-user');
    tbody.innerHTML = '';
    
    users.forEach(u => {
        const roleBadge = u.role === 'Admin' ? `<span class="text-primary font-bold">Admin</span>` : `<span class="text-warning font-bold">Member</span>`;
        const status2FA = u.is_2fa_setup ? `<span class="text-success">Aktif</span>` : `<span class="text-danger">Belum Setup</span>`;
        
        tbody.innerHTML += `
            <tr>
                <td>${u.username}</td>
                <td>${roleBadge}</td>
                <td>${status2FA}</td>
                <td>••••••••</td>
                <td>
                    <button class="btn btn-warning" style="padding:5px 10px; font-size:11px;" onclick="editUser(${u.id})">Edit</button>
                    ${users.length > 1 ? `<button class="btn btn-danger" style="padding:5px 10px; font-size:11px;" onclick="deleteUser(${u.id})">Hapus</button>` : `<span class="badge" style="background:#333;color:#fff;">Default</span>`}
                </td>
            </tr>
        `;
    });
}

async function saveUser() {
    const id = document.getElementById('usr-id').value;
    const user = document.getElementById('usr-name').value;
    const pass = document.getElementById('usr-pass').value;
    const role = document.getElementById('usr-role').value;

    if(!user || !pass) return alert("Username & Password harus diisi!");

    const payload = { username: user, password: pass, role: role };

    if (id) {
        if(isLocalMode) {
            let users = await fetchUsers();
            const idx = users.findIndex(u => u.id == id);
            users[idx] = { ...users[idx], ...payload };
            localStorage.setItem('cloud_users', JSON.stringify(users));
        } else {
            await supabaseClient.from('app_users').update(payload).eq('id', id);
        }
    } else {
        payload.is_2fa_setup = false;
        if(isLocalMode) {
            let users = await fetchUsers();
            payload.id = Date.now();
            users.push(payload);
            localStorage.setItem('cloud_users', JSON.stringify(users));
        } else {
            await supabaseClient.from('app_users').insert([payload]);
        }
    }

    closeModal('modal-user');
    renderUsers();
}

async function editUser(id) {
    const users = await fetchUsers();
    const data = users.find(u => u.id == id);
    if(data) {
        document.getElementById('title-user').innerText = 'Edit Akses User';
        document.getElementById('usr-id').value = data.id;
        document.getElementById('usr-name').value = data.username;
        document.getElementById('usr-pass').value = data.password;
        document.getElementById('usr-role').value = data.role;
        document.getElementById('modal-user').classList.remove('hidden');
    }
}

async function deleteUser(id) {
    if(confirm("Hapus hak akses user ini?")) {
        if(isLocalMode) {
            let users = await fetchUsers();
            users = users.filter(u => u.id != id);
            localStorage.setItem('cloud_users', JSON.stringify(users));
        } else {
            await supabaseClient.from('app_users').delete().eq('id', id);
        }
        renderUsers();
    }
}

// ==========================================
// 5. MODALS & EXCEL EXPORT/IMPORT
// ==========================================
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    if(modalId === 'modal-device') {
        document.getElementById('title-device').innerText = 'Tambah Data Device Baru';
        document.getElementById('dev-id').value = '';
        document.getElementById('dev-nama').value = '';
        document.getElementById('dev-sn').value = '';
        document.getElementById('dev-email').value = '';
        document.getElementById('dev-alamat').value = '';
        // Set Default Kalender Hari ini
        document.getElementById('dev-tgl').value = new Date().toLocaleDateString('en-CA'); 
        document.getElementById('dev-status').value = 'Belum di setup';
    } else if(modalId === 'modal-user') {
        document.getElementById('title-user').innerText = 'Tambah Akun Akses Baru';
        document.getElementById('usr-id').value = '';
        document.getElementById('usr-name').value = '';
        document.getElementById('usr-pass').value = '';
        document.getElementById('usr-role').value = 'Member';
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.add('hidden');
}

async function exportExcel() {
    const devices = await fetchDevices();
    if (!devices || devices.length === 0) return alert("Belum ada data untuk di-export.");
    const worksheet = XLSX.utils.json_to_sheet(devices);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "DataDeploy");
    XLSX.writeFile(workbook, "AutoPilot_Data.xlsx");
}

async function importExcel(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheetName = workbook.SheetNames[0];
        const importedData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        
        if (importedData.length > 0) {
            const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
            const mappedData = importedData.map(item => ({
                id: isLocalMode ? Date.now() + Math.random() : undefined,
                nama: item.nama || '',
                sn: item.sn || '',
                email: item.email || '',
                alamat: item.alamat || '',
                tanggal: item.tanggal || new Date().toLocaleDateString('en-CA'),
                status: item.status || 'Belum di setup',
                history: `Diimpor dari Excel<br><small style="color:var(--text-muted)">${nowStr}</small>`
            }));
            
            if(isLocalMode) {
                let existing = await fetchDevices();
                existing = [...existing, ...mappedData];
                localStorage.setItem('cloud_devices', JSON.stringify(existing));
            } else {
                await supabaseClient.from('devices').insert(mappedData);
            }
            
            renderDevices();
            alert("Berhasil mengimpor data dari Excel!");
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
}