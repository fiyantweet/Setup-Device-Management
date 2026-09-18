// ==========================================
// KONEKSI SUPABASE CLOUD
// ==========================================
const SUPABASE_URL = 'https://xnfdvmxbklqelwvxzygp.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhuZmR2bXhia2xxZWx3dnh6eWdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk2NDgwMzQsImV4cCI6MjEwNTIyNDAzNH0.c6rY_GA0vBjGMnUQc9xDPKSYC1sB1fNiYZU1kVbKt2Q';

let supabaseClient = null;
try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
    console.error("Gagal inisialisasi Supabase:", e);
}

let currentUser = null;
let allDevicesCache = [];

// Cek Sesi Sembuh dari Refresh Browser (Session Persistence)
window.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('autopilot_session_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        initApp();
    }

    // Shortcut Enter Listener
    setupEnterListeners();
});

function setupEnterListeners() {
    const map = [
        ['login-user', 'login-pass'],
        ['login-pass', handleLogin],
        ['mfa-code', handle2FA],
        ['reset-user', 'reset-pass'],
        ['reset-pass', handleReset]
    ];
    map.forEach(([id, target]) => {
        const el = document.getElementById(id);
        if(el) {
            el.addEventListener('keypress', e => {
                if(e.key === 'Enter') {
                    if(typeof target === 'function') target();
                    else document.getElementById(target)?.focus();
                }
            });
        }
    });
}

// ==========================================
// 1. AUTENTIKASI & REFRESH PERSISTENCE
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
    if (!supabaseClient || SUPABASE_URL.includes('ISI_DENGAN')) {
        return alert("Harap isi URL & Anon Key Supabase di script.js!");
    }

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
}

function prepareAuthenticator(account) {
    const qrContainer = document.getElementById('qr-container');
    const qrDiv = document.getElementById('qrcode');
    const instruction = document.getElementById('mfa-instruction');
    qrDiv.innerHTML = ''; 

    if (!account.is_2fa_setup) {
        qrContainer.classList.remove('hidden');
        instruction.innerText = "SETUP PERTAMA: Buka Authenticator dan Scan Barcode ini.";
        const otpUrl = `otpauth://totp/AutoPilot_Cloud:${account.username}?secret=JBSWY3DPEHPK3PXP&issuer=AutoPilot_Cloud`;
        new QRCode(qrDiv, { text: otpUrl, width: 130, height: 130, colorDark: "#000", colorLight: "#fff" });
    } else {
        qrContainer.classList.add('hidden');
        instruction.innerText = "Masukkan 6 digit kode dari aplikasi Authenticator.";
    }
}

async function handle2FA() {
    const code = document.getElementById('mfa-code').value.trim();
    if (code.length === 6 && !isNaN(code)) {
        if (!currentUser.is_2fa_setup) {
            await supabaseClient.from('app_users').update({ is_2fa_setup: true }).eq('id', currentUser.id);
            currentUser.is_2fa_setup = true;
        }
        // Simpan Sesi Ke LocalStorage Agar Refresh Tidak Logout
        localStorage.setItem('autopilot_session_user', JSON.stringify(currentUser));
        
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

    const { data, error } = await supabaseClient.from('app_users').update({ password: newPass }).eq('username', user).select();
    if (error || !data || data.length === 0) {
        alert("Username tidak ditemukan di database!");
    } else {
        alert("Reset Password Berhasil! Silakan login kembali.");
        toggleAuth('login');
    }
}

function logout() {
    localStorage.removeItem('autopilot_session_user');
    currentUser = null;
    document.getElementById('app-section').classList.add('hidden');
    document.getElementById('auth-section').classList.remove('hidden');
    document.querySelectorAll('.input-form').forEach(el => el.value = '');
    toggleAuth('login');
}

// ==========================================
// 2. DASHBOARD & STATS FILTER
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

    await fetchAndCacheDevices();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.currentTarget.classList.add('active');
}

async function fetchAndCacheDevices() {
    const { data, error } = await supabaseClient.from('devices').select('*').order('id', { ascending: false });
    if (!error) {
        allDevicesCache = data || [];
        updateDashboardStats();
        applyTableFilters();
    }
}

function updateDashboardStats() {
    document.getElementById('stat-total').innerText = allDevicesCache.length;
    document.getElementById('stat-belum').innerText = allDevicesCache.filter(d => d.status === 'Belum di setup').length;
    document.getElementById('stat-progress').innerText = allDevicesCache.filter(d => d.status === 'On progress').length;
    document.getElementById('stat-donesetup').innerText = allDevicesCache.filter(d => d.status === 'Done setup').length;
    document.getElementById('stat-donedeploy').innerText = allDevicesCache.filter(d => d.status === 'Done deploy user').length;
}

// Klik pada Statistik Dashboard untuk Filter Cepat
function filterByStatus(statusName) {
    if (statusName === 'All') {
        document.getElementById('filter-status').value = '';
    } else {
        document.getElementById('filter-status').value = statusName;
    }
    applyTableFilters();
}

function resetFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-date').value = '';
    applyTableFilters();
}

// Format Tanggal: YYYY-MM-DD Menjadi DD-MM-YYYY dengan Nama Hari
function formatDisplayDate(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const [year, month, day] = parts;
        const dateObj = new Date(year, month - 1, day);
        const options = { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' };
        return dateObj.toLocaleDateString('id-ID', options); // Contoh: Jumat, 18/09/2026
    }
    return dateStr;
}

function formatTimestamp(ts) {
    if (!ts) return 'Baru saja';
    const d = new Date(ts);
    return d.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}

// ==========================================
// 3. TABLE FILTERING & RENDER
// ==========================================
function applyTableFilters() {
    const textSearch = document.getElementById('search-input').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;
    const dateFilter = document.getElementById('filter-date').value; // Format YYYY-MM-DD dari input type date

    const filtered = allDevicesCache.filter(d => {
        const matchText = (d.nama && d.nama.toLowerCase().includes(textSearch)) || 
                          (d.sn && d.sn.toLowerCase().includes(textSearch));
        const matchStatus = statusFilter === '' || d.status === statusFilter;
        const matchDate = dateFilter === '' || d.tanggal === dateFilter;

        return matchText && matchStatus && matchDate;
    });

    renderDeviceTableDOM(filtered);
}

function getStatusBadge(status) {
    if(status === 'Belum di setup') return `<span class="badge badge-belum">${status}</span>`;
    if(status === 'On progress') return `<span class="badge badge-progress">${status}</span>`;
    if(status === 'Done setup') return `<span class="badge badge-setup">${status}</span>`;
    if(status === 'Done deploy user') return `<span class="badge badge-deploy">${status}</span>`;
    return status;
}

function renderDeviceTableDOM(dataList) {
    const tbody = document.getElementById('table-device');
    tbody.innerHTML = '';

    if (dataList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:30px;">Tidak ada data device yang sesuai.</td></tr>`;
        return;
    }

    dataList.forEach(d => {
        const historyText = `Dibuat: ${formatTimestamp(d.created_at)}<br>Diubah: ${formatTimestamp(d.updated_at)}`;
        tbody.innerHTML += `
            <tr>
                <td>${d.nama || ''}</td>
                <td>${d.sn || ''}</td>
                <td>${d.email || ''}</td>
                <td>${d.alamat || ''}</td>
                <td>${formatDisplayDate(d.tanggal)}</td>
                <td>${getStatusBadge(d.status)}</td>
                <td style="font-size: 11px; color: var(--text-muted); line-height: 1.4;">${historyText}</td>
                <td>
                    <button class="btn btn-warning" style="padding:4px 8px; font-size:11px;" onclick="editDevice(${d.id})">Edit</button>
                    <button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" onclick="deleteDevice(${d.id})">Hapus</button>
                </td>
            </tr>
        `;
    });
}

// ==========================================
// 4. CRUD DEVICES (SUPABASE + HISTORY TIMESTAMP)
// ==========================================
async function saveDevice() {
    const id = document.getElementById('dev-id').value;
    const nowISO = new Date().toISOString();

    const data = {
        nama: document.getElementById('dev-nama').value,
        sn: document.getElementById('dev-sn').value,
        email: document.getElementById('dev-email').value,
        alamat: document.getElementById('dev-alamat').value,
        tanggal: document.getElementById('dev-tgl').value,
        status: document.getElementById('dev-status').value,
        updated_at: nowISO
    };

    if (id) {
        await supabaseClient.from('devices').update(data).eq('id', id);
    } else {
        data.created_at = nowISO;
        await supabaseClient.from('devices').insert([data]);
    }
    
    closeModal('modal-device');
    fetchAndCacheDevices();
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
        document.getElementById('dev-tgl').value = data.tanggal;
        document.getElementById('dev-status').value = data.status;
        document.getElementById('modal-device').classList.remove('hidden');
    }
}

async function deleteDevice(id) {
    if(confirm("Yakin ingin menghapus data device ini dari cloud?")) {
        await supabaseClient.from('devices').delete().eq('id', id);
        fetchAndCacheDevices();
    }
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
        document.getElementById('dev-tgl').value = new Date().toISOString().split('T')[0]; // Default hari ini
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
            const nowISO = new Date().toISOString();
            const mappedData = importedData.map(item => ({
                nama: item.nama || '',
                sn: item.sn || '',
                email: item.email || '',
                alamat: item.alamat || '',
                tanggal: item.tanggal || new Date().toISOString().split('T')[0],
                status: item.status || 'Belum di setup',
                created_at: nowISO,
                updated_at: nowISO
            }));
            
            await supabaseClient.from('devices').insert(mappedData);
            fetchAndCacheDevices();
            alert("Berhasil mengimpor data ke Supabase Cloud!");
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
}