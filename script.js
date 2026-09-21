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

// ==========================================
// SESI PERSISTEN & EVENT LISTENER (ENTER KEY)
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    // Mengecek apakah sebelumnya sudah login (Mencegah ter-logout saat refresh)
    const savedUser = localStorage.getItem('autopilot_current_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        initApp();
    }

    setupEnterListeners();
});

function setupEnterListeners() {
    const attachEnter = (id, action) => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('keypress', e => { if(e.key === 'Enter') action(); });
    };
    
    // Login Form Enter keys
    const lUser = document.getElementById('login-user');
    if(lUser) lUser.addEventListener('keypress', e => { if(e.key === 'Enter') document.getElementById('login-pass').focus(); });
    attachEnter('login-pass', handleLogin);
    
    // 2FA & Reset Password Enter Keys
    attachEnter('mfa-code', handle2FA);
    const rUser = document.getElementById('reset-user');
    if(rUser) rUser.addEventListener('keypress', e => { if(e.key === 'Enter') document.getElementById('reset-pass').focus(); });
    attachEnter('reset-pass', handleReset);
    
    // Search Enter Key
    attachEnter('search-input', searchDevice);
}

// ==========================================
// 1. AUTENTIKASI & LOGIN SISTEM
// ==========================================
function toggleAuth(view) {
    document.getElementById('login-card').classList.add('hidden');
    document.getElementById('mfa-card').classList.add('hidden');
    document.getElementById('reset-card').classList.add('hidden');
    document.getElementById(`${view}-card`).classList.remove('hidden');
}

// Akun Demo Hidden Autofill
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
        alert("Peringatan: URL dan Anon Key Supabase di file script.js belum dikonfigurasi.");
        return;
    }

    try {
        const { data: users, error } = await supabaseClient
            .from('app_users')
            .select('*')
            .eq('username', user)
            .eq('password', pass);

        if (error) return alert("Database Error: " + error.message);
        
        if (!users || users.length === 0) {
            return alert("Gagal Login: Username atau Password salah!");
        }

        currentUser = users[0];
        toggleAuth('mfa');
        prepareAuthenticator(currentUser);
        setTimeout(() => document.getElementById('mfa-code').focus(), 100);
    } catch (err) {
        alert("Terjadi kesalahan koneksi ke Supabase.");
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
            await supabaseClient.from('app_users').update({ is_2fa_setup: true }).eq('id', currentUser.id);
            currentUser.is_2fa_setup = true;
        }

        // Simpan sesi ke localstorage (Agar tidak logout ketika refresh)
        localStorage.setItem('autopilot_current_user', JSON.stringify(currentUser));

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

    const { data, error } = await supabaseClient.from('app_users').update({ password: newPass }).eq('username', user).select();

    if (error || !data || data.length === 0) {
        alert("Gagal Reset: Username tidak ditemukan di database.");
    } else {
        alert("Reset Password Berhasil! Silakan login kembali.");
        toggleAuth('login');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('autopilot_current_user'); // Hapus sesi
    document.getElementById('app-section').classList.add('hidden');
    document.getElementById('auth-section').classList.remove('hidden');
    document.querySelectorAll('.input-form').forEach(el => el.value = '');
    toggleAuth('login');
}

// ==========================================
// 2. INISIALISASI & DASHBOARD STATS
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

    await renderDevices();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.currentTarget.classList.add('active');
}

async function updateDashboardStats(devicesList = []) {
    document.getElementById('stat-total').innerText = devicesList.length;
    document.getElementById('stat-belum').innerText = devicesList.filter(d => d.status === 'Belum di setup').length;
    document.getElementById('stat-progress').innerText = devicesList.filter(d => d.status === 'On progress').length;
    document.getElementById('stat-setup').innerText = devicesList.filter(d => d.status === 'Done setup').length;
    document.getElementById('stat-deploy').innerText = devicesList.filter(d => d.status === 'Done deploy user').length;
}

// Fungsi Klik Filter Statistik
function setStatFilter(status) {
    document.getElementById('filter-status-select').value = status;
    renderDevices();
}

// Format Tanggal: Hari, DD Bulan YYYY (Contoh: Senin, 21 September 2026)
function formatTanggalIndo(dateString) {
    if (!dateString) return '-';
    // Menghindari timezone shift
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString; 
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    return dateObj.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

// ==========================================
// 3. CRUD DEVICES, PENCARIAN & FILTERING
// ==========================================
function getStatusBadge(status) {
    if(status === 'Belum di setup') return `<span class="badge badge-belum">${status}</span>`;
    if(status === 'On progress') return `<span class="badge badge-progress">${status}</span>`;
    if(status === 'Done setup') return `<span class="badge badge-setup">${status}</span>`;
    if(status === 'Done deploy user') return `<span class="badge badge-deploy">${status}</span>`;
    return status;
}

async function renderDevices() {
    const { data: devices, error } = await supabaseClient.from('devices').select('*');
    if (error) return;

    let list = devices || [];
    updateDashboardStats(list); // Update stat dashboard dengan data penuh sebelum di filter

    // 1. Terapkan Filter Dropdown Status
    const selectedStatus = document.getElementById('filter-status-select').value;
    if (selectedStatus !== 'All') {
        list = list.filter(d => d.status === selectedStatus);
    }

    // 2. Terapkan Pencarian Multi (Nama, SN, Email)
    const searchVal = document.getElementById('search-input').value.toLowerCase().trim();
    if (searchVal) {
        list = list.filter(d => 
            (d.nama && d.nama.toLowerCase().includes(searchVal)) || 
            (d.sn && d.sn.toLowerCase().includes(searchVal)) ||
            (d.email && d.email.toLowerCase().includes(searchVal))
        );
    }

    // 3. Terapkan Sortir Tanggal Deploy
    const sortVal = document.getElementById('sort-date-select').value;
    list.sort((a, b) => {
        const timeA = new Date(a.tanggal || 0).getTime();
        const timeB = new Date(b.tanggal || 0).getTime();
        return sortVal === 'oldest' ? timeA - timeB : timeB - timeA;
    });

    const tbody = document.getElementById('table-device');
    tbody.innerHTML = '';

    list.forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${d.nama || ''}</strong></td>
                <td>${d.sn || ''}</td>
                <td>${d.email || ''}</td>
                <td>${d.alamat || ''}</td>
                <td><span class="text-primary">${formatTanggalIndo(d.tanggal)}</span></td>
                <td>${getStatusBadge(d.status)}</td>
                <td><div class="history-text">${d.history || '<em>Belum ada riwayat update.</em>'}</div></td>
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

    if(!tanggal) return alert("Tanggal Deploy Wajib Diisi (Pilih di Kalender)!");

    const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

    if (id) {
        const { data: oldData } = await supabaseClient.from('devices').select('history, status').eq('id', id).single();
        let historyLog = oldData?.history || '';
        
        // Log realtime jika status berubah
        if (oldData?.status !== status) {
            historyLog = `[Update] Status diubah ke <strong>${status}</strong> pada ${nowStr}<br><hr style="border-color:#333;margin:4px 0;">${historyLog}`;
        }

        await supabaseClient.from('devices').update({
            nama, sn, email, alamat, tanggal, status, history: historyLog
        }).eq('id', id);
    } else {
        const newHistory = `[New] Data device dibuat pada ${nowStr}`;
        await supabaseClient.from('devices').insert([{
            nama, sn, email, alamat, tanggal, status, history: newHistory
        }]);
    }
    
    closeModal('modal-device');
    renderDevices();
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
        document.getElementById('dev-tgl').value = data.tanggal; // Value untuk input type="date"
        document.getElementById('dev-status').value = data.status;
        document.getElementById('modal-device').classList.remove('hidden');
    }
}

async function deleteDevice(id) {
    if(confirm("Apakah Anda yakin ingin menghapus data device ini dari cloud?")) {
        await supabaseClient.from('devices').delete().eq('id', id);
        renderDevices();
    }
}

// ==========================================
// 4. CRUD USERS (SUPABASE)
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
        // Set Default kalender ke Hari Ini (YYYY-MM-DD)
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
    const { data: devices } = await supabaseClient.from('devices').select('*');
    if (!devices || devices.length === 0) return alert("Belum ada data untuk di-export.");
    const worksheet = XLSX.utils.json_to_sheet(devices);
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
            const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
            const mappedData = importedData.map(item => ({
                nama: item.nama || '',
                sn: item.sn || '',
                email: item.email || '',
                alamat: item.alamat || '',
                tanggal: item.tanggal || new Date().toLocaleDateString('en-CA'),
                status: item.status || 'Belum di setup',
                history: `[New] Diimpor dari Excel pada ${nowStr}`
            }));
            
            await supabaseClient.from('devices').insert(mappedData);
            renderDevices();
            alert("Berhasil mengimpor data ke Supabase Cloud!");
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
}