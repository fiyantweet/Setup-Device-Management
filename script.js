// ==========================================
// KONEKSI SUPABASE CLOUD
// ==========================================
const SUPABASE_URL = 'ISI_DENGAN_PROJECT_URL_SUPABASE_ANDA';
const SUPABASE_ANON_KEY = 'ISI_DENGAN_ANON_KEY_SUPABASE_ANDA';

let supabaseClient = null;
try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.error("Gagal menginisialisasi Supabase:", e);
}

let currentUser = null;
let allDevicesCache = [];

// ==========================================
// SESSION PERSISTENCE (CEK REFRESH BROWSER)
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('autopilot_cloud_session');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        initApp();
    }

    // Shortcut Tombol Enter
    setupEnterListeners();
});

function setupEnterListeners() {
    const bind = (id, fn) => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('keypress', e => { if(e.key === 'Enter') fn(); });
    };
    bind('login-user', () => document.getElementById('login-pass').focus());
    bind('login-pass', handleLogin);
    bind('mfa-code', handle2FA);
    bind('reset-user', () => document.getElementById('reset-pass').focus());
    bind('reset-pass', handleReset);
}

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
    
    if (!user || !pass) return alert("Username dan Password tidak boleh kosong!");
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

        if (error || !users || users.length === 0) {
            alert("Gagal Login: Username atau Password salah!");
            return;
        }

        currentUser = users[0];
        toggleAuth('mfa');
        prepareAuthenticator(currentUser);
        setTimeout(() => document.getElementById('mfa-code').focus(), 100);
    } catch (err) {
        console.error("Login Error:", err);
        alert("Terjadi kesalahan koneksi database.");
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
        const otpUrl = `otpauth://totp/AutoPilot_Cloud:${account.username}?secret=JBSWY3DPEHPK3PXP&issuer=AutoPilotCloud`;
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
            await supabaseClient.from('app_users').update({ is_2fa_setup: true }).eq('id', currentUser.id);
            currentUser.is_2fa_setup = true;
        }
        // Simpan Sesi Login agar tidak hilang saat refresh
        localStorage.setItem('autopilot_cloud_session', JSON.stringify(currentUser));

        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        initApp();
    } else {
        alert("Kode 2FA tidak valid! Masukkan 6 digit angka.");
    }
}

async function handleReset() {
    const user = document.getElementById('reset-user').value.trim();
    const newPass = document.getElementById('reset-pass').value.trim();
    
    if(!user || !newPass) return alert("Isi Username dan Password Baru!");

    const { data, error } = await supabaseClient
        .from('app_users')
        .update({ password: newPass })
        .eq('username', user)
        .select();

    if (error || !data || data.length === 0) {
        alert("Username tidak ditemukan di database.");
    } else {
        alert("Reset Password Berhasil! Silakan login.");
        toggleAuth('login');
    }
}

function logout() {
    localStorage.removeItem('autopilot_cloud_session');
    currentUser = null;
    document.getElementById('app-section').classList.add('hidden');
    document.getElementById('auth-section').classList.remove('hidden');
    document.querySelectorAll('.input-form').forEach(el => el.value = '');
    toggleAuth('login');
}

// ==========================================
// 2. INISIALISASI & DASHBOARD
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

function updateDashboardStats(devicesData) {
    const total = devicesData.length;
    const belum = devicesData.filter(d => d.status === 'Belum di setup').length;
    const progress = devicesData.filter(d => d.status === 'On progress').length;
    const doneSetup = devicesData.filter(d => d.status === 'Done setup').length;
    const doneDeploy = devicesData.filter(d => d.status === 'Done deploy user').length;

    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-belum').innerText = belum;
    document.getElementById('stat-progress').innerText = progress;
    document.getElementById('stat-donesetup').innerText = doneSetup;
    document.getElementById('stat-donedeploy').innerText = doneDeploy;
}

// ==========================================
// 3. FORMAT TANGGAL & FILTER KARTU STATISTIK
// ==========================================
// Format YYYY-MM-DD ke DD/MM/YYYY lengkap dengan Nama Hari
function formatDateIndo(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const year = parts[0];
    const month = parts[1];
    const day = parts[2];
    
    // Urutan: Tanggal, Bulan kemudian Tahun (DD/MM/YYYY)
    const formattedDateOnly = `${day}/${month}/${year}`;
    
    // Tambahkan info Hari (Opsional jika ingin lengkap)
    const dateObj = new Date(dateStr);
    const options = { weekday: 'long' };
    const dayName = isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleDateString('id-ID', options);

    return dayName ? `${dayName}, ${formattedDateOnly}` : formattedDateOnly;
}

let activeCardFilter = 'all';

function filterByCard(status) {
    activeCardFilter = status;
    // Sinkronkan dropdown status
    document.getElementById('filter-status').value = status === 'all' ? '' : status;
    applyFilters();
}

function resetFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-date').value = '';
    activeCardFilter = 'all';
    applyFilters();
}

async function fetchAndRenderDevices() {
    const { data, error } = await supabaseClient.from('devices').select('*').order('id', { ascending: false });
    if (error) { console.error(error); return; }
    allDevicesCache = data || [];
    updateDashboardStats(allDevicesCache);
    applyFilters();
}

function applyFilters() {
    const searchVal = document.getElementById('search-input').value.toLowerCase();
    const statusVal = document.getElementById('filter-status').value;
    const dateVal = document.getElementById('filter-date').value; // Format: YYYY-MM-DD

    let filtered = allDevicesCache.filter(d => {
        const matchSearch = (d.nama && d.nama.toLowerCase().includes(searchVal)) || (d.sn && d.sn.toLowerCase().includes(searchVal));
        const matchStatusCard = (activeCardFilter === 'all' || d.status === activeCardFilter);
        const matchStatusDropdown = (!statusVal || d.status === statusVal);
        const matchDate = (!dateVal || d.tanggal === dateVal);

        return matchSearch && matchStatusCard && matchStatusDropdown && matchDate;
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

    if (devices.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">Tidak ada data device ditemukan.</td></tr>`;
        return;
    }

    devices.forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td>${d.nama || ''}</td>
                <td>${d.sn || ''}</td>
                <td>${d.email || ''}</td>
                <td>${d.alamat || ''}</td>
                <td>${formatDateIndo(d.tanggal)}</td>
                <td>${getStatusBadge(d.status)}</td>
                <td>
                    <button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="showHistory(${d.id})">History</button>
                    <button class="btn btn-warning" style="padding:4px 8px; font-size:11px;" onclick="editDevice(${d.id})">Edit</button>
                    <button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" onclick="deleteDevice(${d.id})">Hapus</button>
                </td>
            </tr>
        `;
    });
}

// ==========================================
// 4. CRUD DEVICES & HISTORY
// ==========================================
async function saveDevice() {
    const id = document.getElementById('dev-id').value;
    const nowIso = new Date().toISOString();

    const data = {
        nama: document.getElementById('dev-nama').value,
        sn: document.getElementById('dev-sn').value,
        email: document.getElementById('dev-email').value,
        alamat: document.getElementById('dev-alamat').value,
        tanggal: document.getElementById('dev-tgl').value, // Format YYYY-MM-DD dari kalender
        status: document.getElementById('dev-status').value,
        updated_at: nowIso
    };

    if (id) {
        await supabaseClient.from('devices').update(data).eq('id', id);
    } else {
        data.created_at = nowIso;
        await supabaseClient.from('devices').insert([data]);
    }
    
    closeModal('modal-device');
    fetchAndRenderDevices();
}

async function editDevice(id) {
    const { data } = await supabaseClient.from('devices').select('*').eq('id', id).single();
    if(data) {
        document.getElementById('title-device').innerText = 'Edit Status & Data Deploy';
        document.getElementById('dev-id').value = data.id;
        document.getElementById('dev-nama').value = data.nama;
        document.getElementById('dev-sn').value = data.sn;
        document.getElementById('dev-email').value = data.email;
        document.getElementById('dev-alamat').value = data.alamat;
        document.getElementById('dev-tgl').value = data.tanggal || '';
        document.getElementById('dev-status').value = data.status;
        document.getElementById('modal-device').classList.remove('hidden');
    }
}

async function deleteDevice(id) {
    if(confirm("Apakah Anda yakin ingin menghapus data device ini dari cloud?")) {
        await supabaseClient.from('devices').delete().eq('id', id);
        fetchAndRenderDevices();
    }
}

// Fitur Menampilkan History Dibuat dan Diubah
async function showHistory(id) {
    const { data, error } = await supabaseClient.from('devices').select('created_at, updated_at, nama').eq('id', id).single();
    if (error || !data) {
        alert("Gagal memuat riwayat history.");
        return;
    }

    const formatTimestamp = (ts) => {
        if (!ts) return '-';
        const date = new Date(ts);
        return isNaN(date.getTime()) ? ts : date.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'medium' });
    };

    const contentDiv = document.getElementById('history-content');
    contentDiv.innerHTML = `
        <p><strong>Nama User:</strong> ${data.nama}</p>
        <hr style="border-color: var(--border); margin: 10px 0;">
        <p><strong>📅 Dibuat Pada:</strong><br><span class="text-primary">${formatTimestamp(data.created_at)}</span></p>
        <br>
        <p><strong>🔄 Terakhir Diubah:</strong><br><span class="text-warning">${formatTimestamp(data.updated_at)}</span></p>
    `;
    document.getElementById('modal-history').classList.remove('hidden');
}

// ==========================================
// 5. CRUD USERS
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
// 6. MODALS & EXCEL EXPORT/IMPORT
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
    if (!allDevicesCache || allDevicesCache.length === 0) return alert("Belum ada data untuk di-export.");
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
            const nowIso = new Date().toISOString();
            const mappedData = importedData.map(item => ({
                nama: item.nama || '',
                sn: item.sn || '',
                email: item.email || '',
                alamat: item.alamat || '',
                tanggal: item.tanggal || '',
                status: item.status || 'Belum di setup',
                created_at: nowIso,
                updated_at: nowIso
            }));
            
            await supabaseClient.from('devices').insert(mappedData);
            fetchAndRenderDevices();
            alert("Berhasil mengimpor data ke Supabase Cloud!");
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
}