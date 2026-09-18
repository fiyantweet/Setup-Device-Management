// ==========================================
// KONEKSI SUPABASE CLOUD
// ==========================================
const SUPABASE_URL = 'https://xnfdvmxbklqelwvxzygp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuZmR2bXhia2xxZWx3dnh6eWdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NDgwMzQsImV4cCI6MjEwNTIyNDAzNH0.c6rY_GA0vBjGMnUQc9xDPKSYC1sB1fNiYZU1kVbKt2Q';

let supabaseClient = null;
try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.error("Gagal menginisialisasi Supabase:", e);
}

let currentUser = null;
let allDevicesCache = [];

// ==========================================
// PERSISTEN SESI & INIT AUTO CHECK
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    // Cek apakah user sebelumnya sudah login (Persisten Session saat Refresh)
    const savedSession = localStorage.getItem('autopilot_session');
    if (savedSession) {
        try {
            currentUser = JSON.parse(savedSession);
            document.getElementById('auth-section').classList.add('hidden');
            document.getElementById('app-section').classList.remove('hidden');
            await initApp();
        } catch (e) {
            localStorage.removeItem('autopilot_session');
        }
    }

    // Shortcut Enter Listener
    const loginUser = document.getElementById('login-user');
    const loginPass = document.getElementById('login-pass');
    const mfaCode = document.getElementById('mfa-code');
    const resetUser = document.getElementById('reset-user');
    const resetPass = document.getElementById('reset-pass');

    if(loginUser) loginUser.addEventListener('keypress', e => { if(e.key === 'Enter') loginPass.focus(); });
    if(loginPass) loginPass.addEventListener('keypress', e => { if(e.key === 'Enter') handleLogin(); });
    if(mfaCode) mfaCode.addEventListener('keypress', e => { if(e.key === 'Enter') handle2FA(); });
    if(resetUser) resetUser.addEventListener('keypress', e => { if(e.key === 'Enter') resetPass.focus(); });
    if(resetPass) resetPass.addEventListener('keypress', e => { if(e.key === 'Enter') handleReset(); });
});

// ==========================================
// 1. SISTEM AUTENTIKASI
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
    
    if (!user || !pass) {
        alert("Username dan Password tidak boleh kosong!");
        return;
    }

    if (!supabaseClient || SUPABASE_URL.includes('ISI_DENGAN')) {
        alert("Konfigurasi Supabase URL dan Anon Key belum diisi di script.js!");
        return;
    }

    try {
        const { data: users, error } = await supabaseClient
            .from('app_users')
            .select('*')
            .eq('username', user)
            .eq('password', pass);

        if (error) {
            alert("Database Error: " + error.message);
            return;
        }

        if (!users || users.length === 0) {
            alert("Gagal Login: Username atau Password salah!");
            return;
        }

        currentUser = users[0];
        toggleAuth('mfa');
        prepareAuthenticator(currentUser);
        setTimeout(() => document.getElementById('mfa-code').focus(), 100);

    } catch (err) {
        console.error("Login Exception:", err);
        alert("Terjadi kesalahan koneksi ke server Supabase.");
    }
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
        new QRCode(qrDiv, { text: otpUrl, width: 140, height: 140, colorDark: "#000", colorLight: "#fff" });
    } else {
        qrContainer.classList.add('hidden');
        instruction.innerText = "Masukkan 6 digit kode dari aplikasi Authenticator Anda.";
    }
}

async function handle2FA() {
    const code = document.getElementById('mfa-code').value.trim();
    
    if (code.length === 6 && !isNaN(code)) {
        if (!currentUser.is_2fa_setup) {
            await supabaseClient
                .from('app_users')
                .update({ is_2fa_setup: true })
                .eq('id', currentUser.id);
            currentUser.is_2fa_setup = true;
        }
        
        // Simpan sesi login ke localStorage agar tahan refresh browser
        localStorage.setItem('autopilot_session', JSON.stringify(currentUser));

        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        await initApp();
    } else {
        alert("Kode 2FA tidak valid! Harap masukkan 6 digit angka.");
    }
}

async function handleReset() {
    const user = document.getElementById('reset-user').value.trim();
    const newPass = document.getElementById('reset-pass').value.trim();
    
    if(!user || !newPass) return alert("Harap isi Username dan Password Baru!");

    const { data, error } = await supabaseClient
        .from('app_users')
        .update({ password: newPass })
        .eq('username', user)
        .select();

    if (error || !data || data.length === 0) {
        alert("Gagal Reset: Username tersebut tidak ditemukan.");
    } else {
        alert("Reset Password Berhasil! Silakan login kembali.");
        toggleAuth('login');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('autopilot_session'); // Hapus sesi persisten
    document.getElementById('app-section').classList.add('hidden');
    document.getElementById('auth-section').classList.remove('hidden');
    document.querySelectorAll('.input-form').forEach(el => el.value = '');
    toggleAuth('login');
}

// ==========================================
// 2. INISIALISASI DASHBOARD
// ==========================================
async function initApp() {
    if(!currentUser) return;
    document.getElementById('login-role-badge').innerText = `[ ${currentUser.role} ]`;

    if(currentUser.role === 'Admin') {
        document.getElementById('tab-btn-admin').style.display = 'inline-block';
        renderUsers();
    } else {
        document.getElementById('tab-btn-admin').style.display = 'none';
        switchTab('device');
    }

    await fetchAndRenderDevices();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.currentTarget.classList.add('active');
}

// ==========================================
// 3. FORMAT TANGGAL & HISTORY
// ==========================================
// Mengubah format YYYY-MM-DD menjadi DD/MM/YYYY (Hari, Bulan, Tahun)
function formatTanggalID(dateStr) {
    if (!dateStr) return '';
    // Jika format sudah DD/MM/YYYY
    if (dateStr.includes('/')) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

// Format waktu saat ini untuk history Dibuat / Diubah
function getCurrentTimestamp() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

// ==========================================
// 4. FILTER DASHBOARD & TABEL
// ==========================================
async function fetchAndRenderDevices() {
    const { data: devices, error } = await supabaseClient.from('devices').select('*');
    if (error) { console.error(error); return; }
    allDevicesCache = devices || [];
    updateDashboardStats(allDevicesCache);
    renderDeviceTable(allDevicesCache);
}

function updateDashboardStats(devices) {
    document.getElementById('stat-total').innerText = devices.length;
    document.getElementById('stat-belum').innerText = devices.filter(d => d.status === 'Belum di setup').length;
    document.getElementById('stat-progress').innerText = devices.filter(d => d.status === 'On progress').length;
    document.getElementById('stat-setup').innerText = devices.filter(d => d.status === 'Done setup').length;
    document.getElementById('stat-deploy').innerText = devices.filter(d => d.status === 'Done deploy user').length;
}

// Klik Stat Card di atas untuk memfilter berdasarkan status
function filterByStatus(status) {
    if (status === 'All') {
        document.getElementById('filter-status').value = '';
    } else {
        document.getElementById('filter-status').value = status;
    }
    applyTableFilters();
}

// Filter Tabel Realtime (Pencarian, Tgl Deploy, dan Status Deploy)
function applyTableFilters() {
    const searchVal = document.getElementById('search-input').value.toLowerCase();
    const tglVal = document.getElementById('filter-tgl').value.toLowerCase();
    const statusVal = document.getElementById('filter-status').value;

    const filtered = allDevicesCache.filter(d => {
        const matchSearch = (d.nama && d.nama.toLowerCase().includes(searchVal)) || 
                            (d.sn && d.sn.toLowerCase().includes(searchVal)) ||
                            (d.email && d.email.toLowerCase().includes(searchVal));
        
        const formattedTgl = formatTanggalID(d.tanggal || '').toLowerCase();
        const matchTgl = formattedTgl.includes(tglVal) || (d.tanggal && d.tanggal.toLowerCase().includes(tglVal));
        
        const matchStatus = statusVal === '' || d.status === statusVal;

        return matchSearch && matchTgl && matchStatus;
    });

    renderDeviceTable(filtered);
}

function getStatusBadge(status) {
    if(status === 'Belum di setup') return `<span class="badge badge-belum">${status}</span>`;
    if(status === 'On progress') return `<span class="badge badge-progress">${status}</span>`;
    if(status === 'Done setup') return `<span class="badge badge-setup">${status}</span>`;
    if(status === 'Done deploy user') return `<span class="badge badge-deploy">${status}</span>`;
    return status;
}

function renderDeviceTable(devices) {
    const tbody = document.getElementById('table-device');
    tbody.innerHTML = '';

    devices.forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td>${d.nama || ''}</td>
                <td>${d.sn || ''}</td>
                <td>${d.email || ''}</td>
                <td>${d.alamat || ''}</td>
                <td>${formatTanggalID(d.tanggal)}</td>
                <td>${getStatusBadge(d.status)}</td>
                <td><small style="color:var(--text-muted);">${d.created_at || '-'}</small></td>
                <td><small style="color:var(--text-muted);">${d.updated_at || '-'}</small></td>
                <td>
                    <button class="btn btn-warning" style="padding:4px 8px; font-size:11px;" onclick="editDevice(${d.id})">Edit</button>
                    <button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" onclick="deleteDevice(${d.id})">Hapus</button>
                </td>
            </tr>
        `;
    });
}

// ==========================================
// 5. CRUD DEVICES (SUPABASE)
// ==========================================
async function saveDevice() {
    const id = document.getElementById('dev-id').value;
    const existingCreatedAt = document.getElementById('dev-created-at').value;
    const nowTime = getCurrentTimestamp();

    const data = {
        nama: document.getElementById('dev-nama').value,
        sn: document.getElementById('dev-sn').value,
        email: document.getElementById('dev-email').value,
        alamat: document.getElementById('dev-alamat').value,
        tanggal: document.getElementById('dev-tgl').value, // Input format HTML date YYYY-MM-DD
        status: document.getElementById('dev-status').value,
        updated_at: nowTime
    };

    if (id) {
        data.created_at = existingCreatedAt || nowTime;
        await supabaseClient.from('devices').update(data).eq('id', id);
    } else {
        data.created_at = nowTime;
        await supabaseClient.from('devices').insert([data]);
    }
    
    closeModal('modal-device');
    await fetchAndRenderDevices();
}

async function editDevice(id) {
    const { data } = await supabaseClient.from('devices').select('*').eq('id', id).single();
    if(data) {
        document.getElementById('title-device').innerText = 'Edit Status & Data Deploy';
        document.getElementById('dev-id').value = data.id;
        document.getElementById('dev-created-at').value = data.created_at || '';
        document.getElementById('dev-nama').value = data.nama || '';
        document.getElementById('dev-sn').value = data.sn || '';
        document.getElementById('dev-email').value = data.email || '';
        document.getElementById('dev-alamat').value = data.alamat || '';
        document.getElementById('dev-tgl').value = data.tanggal || '';
        document.getElementById('dev-status').value = data.status || 'Belum di setup';
        document.getElementById('modal-device').classList.remove('hidden');
    }
}

async function deleteDevice(id) {
    if(confirm("Apakah Anda yakin ingin menghapus data device ini dari cloud?")) {
        await supabaseClient.from('devices').delete().eq('id', id);
        await fetchAndRenderDevices();
    }
}

// ==========================================
// 6. CRUD USERS (SUPABASE)
// ==========================================
async function renderUsers() {
    const { data: users } = await supabaseClient.from('app_users').select('*');
    const tbody = document.getElementById('table-user');
    tbody.innerHTML = '';
    
    if(!users) return;
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

    const data = { username: user, password: pass, role: role };

    if (id) {
        await supabaseClient.from('app_users').update(data).eq('id', id);
    } else {
        await supabaseClient.from('app_users').insert([{ ...data, is_2fa_setup: false }]);
    }

    closeModal('modal-user');
    renderUsers();
}

async function editUser(id) {
    const { data } = await supabaseClient.from('app_users').select('*').eq('id', id).single();
    if(data) {
        document.getElementById('title-user').innerText = 'Edit Akses User Cloud';
        document.getElementById('usr-id').value = data.id;
        document.getElementById('usr-name').value = data.username;
        document.getElementById('usr-pass').value = data.password;
        document.getElementById('usr-role').value = data.role;
        document.getElementById('modal-user').classList.remove('hidden');
    }
}

async function deleteUser(id) {
    if(confirm("Hapus hak akses user ini dari cloud?")) {
        await supabaseClient.from('app_users').delete().eq('id', id);
        renderUsers();
    }
}

// ==========================================
// 7. MODALS & EXCEL EXPORT/IMPORT
// ==========================================
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    if(modalId === 'modal-device') {
        document.getElementById('title-device').innerText = 'Tambah Data Device Baru';
        document.getElementById('dev-id').value = '';
        document.getElementById('dev-created-at').value = '';
        document.getElementById('dev-nama').value = '';
        document.getElementById('dev-sn').value = '';
        document.getElementById('dev-email').value = '';
        document.getElementById('dev-alamat').value = '';
        document.getElementById('dev-tgl').value = '';
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
    if (allDevicesCache.length === 0) return alert("Belum ada data untuk di-export.");
    const worksheet = XLSX.utils.json_to_sheet(allDevicesCache);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "DataDeploy");
    XLSX.writeFile(workbook, "AutoPilot_Cloud_Data.xlsx");
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
            const nowTime = getCurrentTimestamp();
            const mappedData = importedData.map(item => ({
                nama: item.nama || '',
                sn: item.sn || '',
                email: item.email || '',
                alamat: item.alamat || '',
                tanggal: item.tanggal || '',
                status: item.status || 'Belum di setup',
                created_at: item.created_at || nowTime,
                updated_at: nowTime
            }));
            
            await supabaseClient.from('devices').insert(mappedData);
            await fetchAndRenderDevices();
            alert("Berhasil mengimpor data ke Supabase Cloud!");
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
}