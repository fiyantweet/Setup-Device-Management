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
let currentStatusFilter = 'All';

// Sesi Persisten saat Browser Dimuat / Di-refresh
window.addEventListener('DOMContentLoaded', () => {
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
    const lUser = document.getElementById('login-user');
    const lPass = document.getElementById('login-pass');
    const mCode = document.getElementById('mfa-code');
    const rUser = document.getElementById('reset-user');
    const rPass = document.getElementById('reset-pass');
    const sInput = document.getElementById('search-input');

    if(lUser) lUser.addEventListener('keypress', e => { if(e.key === 'Enter') lPass.focus(); });
    if(lPass) lPass.addEventListener('keypress', e => { if(e.key === 'Enter') handleLogin(); });
    if(mCode) mCode.addEventListener('keypress', e => { if(e.key === 'Enter') handle2FA(); });
    if(rUser) rUser.addEventListener('keypress', e => { if(e.key === 'Enter') rPass.focus(); });
    if(rPass) rPass.addEventListener('keypress', e => { if(e.key === 'Enter') handleReset(); });
    if(sInput) sInput.addEventListener('keypress', e => { if(e.key === 'Enter') searchDevice(); });
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

function fillDemoAccount() {
    document.getElementById('login-user').value = 'admin';
    document.getElementById('login-pass').value = 'admin123';
    document.getElementById('login-pass').focus();
}

async function handleLogin() {
    const user = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    
    if (!user || !pass) {
        alert("Username dan Password wajib diisi!");
        return;
    }

    if (!supabaseClient || SUPABASE_URL.includes('ISI_DENGAN')) {
        alert("Konfigurasi Supabase URL dan Anon Key belum diisi di file script.js!");
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
            alert("Login Gagal: Username atau Password salah!");
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
            await supabaseClient
                .from('app_users')
                .update({ is_2fa_setup: true })
                .eq('id', currentUser.id);
            currentUser.is_2fa_setup = true;
        }

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

    const { data, error } = await supabaseClient
        .from('app_users')
        .update({ password: newPass })
        .eq('username', user)
        .select();

    if (error || !data || data.length === 0) {
        alert("Gagal Reset: Username tidak ditemukan di database.");
    } else {
        alert("Reset Password Berhasil! Silakan login kembali.");
        toggleAuth('login');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('autopilot_current_user');
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

    await renderDevices();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.currentTarget.classList.add('active');
}

async function updateDashboardStats() {
    const { data: devices } = await supabaseClient.from('devices').select('*');
    if(!devices) return;
    
    document.getElementById('stat-total').innerText = devices.length;
    document.getElementById('stat-belum').innerText = devices.filter(d => d.status === 'Belum di setup').length;
    document.getElementById('stat-progress').innerText = devices.filter(d => d.status === 'On progress').length;
    document.getElementById('stat-setup').innerText = devices.filter(d => d.status === 'Done setup').length;
    document.getElementById('stat-deploy').innerText = devices.filter(d => d.status === 'Done deploy user').length;
}

function filterByStatCard(status) {
    document.getElementById('filter-status').value = status;
    renderDevices();
}

// Format Tanggal: Hari, Bulan, Tahun (Contoh: Senin, 21 September 2026)
function formatTanggalIndo(dateString) {
    if (!dateString) return '-';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    const [year, month, day] = parts;
    const dateObj = new Date(year, month - 1, day);
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return dateObj.toLocaleDateString('id-ID', options);
}

// ==========================================
// 3. CRUD DEVICES & SELECT FILTERS / HISTORY
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
    if (error) { console.error(error); return; }

    const tbody = document.getElementById('table-device');
    tbody.innerHTML = '';

    let list = devices || [];

    // Populate dynamic column select filters
    populateColumnSelects(list);

    // Filter Status Dropdown
    const selectedStatus = document.getElementById('filter-status').value;
    if (selectedStatus !== 'All') {
        list = list.filter(d => d.status === selectedStatus);
    }

    // Filter pencarian teks umum
    const searchVal = document.getElementById('search-input').value.toLowerCase();
    if (searchVal) {
        list = list.filter(d => 
            (d.nama && d.nama.toLowerCase().includes(searchVal)) || 
            (d.sn && d.sn.toLowerCase().includes(searchVal))
        );
    }

    // Filter spesifik per kolom select
    const fNama = document.getElementById('select-filter-nama').value;
    const fSn = document.getElementById('select-filter-sn').value;
    const fEmail = document.getElementById('select-filter-email').value;
    const fAlamat = document.getElementById('select-filter-alamat').value;

    if (fNama) list = list.filter(d => d.nama === fNama);
    if (fSn) list = list.filter(d => d.sn === fSn);
    if (fEmail) list = list.filter(d => d.email === fEmail);
    if (fAlamat) list = list.filter(d => d.alamat === fAlamat);

    // Sort Tanggal Deploy
    const sortVal = document.getElementById('sort-tgl').value;
    list.sort((a, b) => {
        const dateA = a.tanggal || '';
        const dateB = b.tanggal || '';
        if (sortVal === 'oldest') {
            return dateA.localeCompare(dateB);
        } else {
            return dateB.localeCompare(dateA);
        }
    });

    list.forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td><input type="checkbox" class="row-checkbox" value="${d.id}"></td>
                <td>${d.nama || ''}</td>
                <td>${d.sn || ''}</td>
                <td>${d.email || ''}</td>
                <td>${d.alamat || ''}</td>
                <td><strong>${formatTanggalIndo(d.tanggal)}</strong></td>
                <td>${getStatusBadge(d.status)}</td>
                <td><div class="history-text">${d.history || 'Dibuat: -'}</div></td>
                <td>
                    <button class="btn btn-warning" style="padding:5px 10px; font-size:11px;" onclick="editDevice(${d.id})">Edit</button>
                    <button class="btn btn-danger" style="padding:5px 10px; font-size:11px;" onclick="deleteDevice(${d.id})">Hapus</button>
                </td>
            </tr>
        `;
    });
    updateDashboardStats();
}

function populateColumnSelects(devices) {
    const fNama = document.getElementById('select-filter-nama');
    const fSn = document.getElementById('select-filter-sn');
    const fEmail = document.getElementById('select-filter-email');
    const fAlamat = document.getElementById('select-filter-alamat');

    const currNama = fNama.value;
    const currSn = fSn.value;
    const currEmail = fEmail.value;
    const currAlamat = fAlamat.value;

    const uniqueNama = [...new Set(devices.map(d => d.nama).filter(Boolean))];
    const uniqueSn = [...new Set(devices.map(d => d.sn).filter(Boolean))];
    const uniqueEmail = [...new Set(devices.map(d => d.email).filter(Boolean))];
    const uniqueAlamat = [...new Set(devices.map(d => d.alamat).filter(Boolean))];

    fNama.innerHTML = '<option value="">Semua Nama User</option>' + uniqueNama.map(n => `<option value="${n}">${n}</option>`).join('');
    fSn.innerHTML = '<option value="">Semua Serial Number</option>' + uniqueSn.map(s => `<option value="${s}">${s}</option>`).join('');
    fEmail.innerHTML = '<option value="">Semua Email</option>' + uniqueEmail.map(e => `<option value="${e}">${e}</option>`).join('');
    fAlamat.innerHTML = '<option value="">Semua Alamat</option>' + uniqueAlamat.map(a => `<option value="${a}">${a}</option>`).join('');

    fNama.value = currNama;
    fSn.value = currSn;
    fEmail.value = currEmail;
    fAlamat.value = currAlamat;
}

function resetColumnFilters() {
    document.getElementById('select-filter-nama').value = '';
    document.getElementById('select-filter-sn').value = '';
    document.getElementById('select-filter-email').value = '';
    document.getElementById('select-filter-alamat').value = '';
    document.getElementById('filter-status').value = 'All';
    document.getElementById('search-input').value = '';
    renderDevices();
}

function toggleSelectAll(master) {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => cb.checked = master.checked);
}

async function searchDevice() {
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

    const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

    if (id) {
        const { data: oldData } = await supabaseClient.from('devices').select('history, status, tanggal').eq('id', id).single();
        let historyLog = oldData?.history || '';
        
        if (oldData?.status !== status) {
            historyLog += `<br>• Status diubah ke <strong>${status}</strong> (${nowStr})`;
        }
        if (oldData?.tanggal !== tanggal) {
            historyLog += `<br>• Tgl deploy diubah ke ${formatTanggalIndo(tanggal)} (${nowStr})`;
        }

        await supabaseClient.from('devices').update({
            nama, sn, email, alamat, tanggal, status, history: historyLog
        }).eq('id', id);
    } else {
        const newHistory = `Dibuat pada ${nowStr}`;
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
        document.getElementById('dev-tgl').value = data.tanggal;
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
        document.getElementById('dev-tgl').value = new Date().toISOString().split('T')[0];
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
                tanggal: item.tanggal || new Date().toISOString().split('T')[0],
                status: item.status || 'Belum di setup',
                history: `Diimpor dari Excel pada ${nowStr}`
            }));
            
            await supabaseClient.from('devices').insert(mappedData);
            renderDevices();
            alert("Berhasil mengimpor data ke Supabase Cloud!");
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
}