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

// ==========================================
// 1. SISTEM AUTENTIKASI & LOGIN
// ==========================================
function toggleAuth(view) {
    document.getElementById('login-card').classList.add('hidden');
    document.getElementById('mfa-card').classList.add('hidden');
    document.getElementById('reset-card').classList.add('hidden');
    document.getElementById(`${view}-card`).classList.remove('hidden');
}

// Fitur Hidden Demo Account
function fillDemoAccount() {
    const userInput = document.getElementById('login-user');
    const passInput = document.getElementById('login-pass');
    if (userInput && passInput) {
        userInput.value = 'admin';
        passInput.value = 'admin123';
        passInput.focus();
    }
}

// Fungsi Utama Login yang Diperbaiki
async function handleLogin() {
    const userInput = document.getElementById('login-user');
    const passInput = document.getElementById('login-pass');
    
    if (!userInput || !passInput) return;
    
    const user = userInput.value.trim();
    const pass = passInput.value.trim();
    
    if (!user || !pass) {
        alert("Username dan Password tidak boleh kosong!");
        return;
    }

    if (!supabaseClient || SUPABASE_URL.includes('ISI_DENGAN')) {
        alert("Konfigurasi URL dan Anon Key Supabase di file script.js belum diisi dengan benar!");
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
            alert("Gagal Login: Username atau Password salah, atau akun belum terdaftar di database Supabase!");
            return;
        }

        currentUser = users[0];
        toggleAuth('mfa');
        prepareAuthenticator(currentUser);
        setTimeout(() => {
            const mfaInput = document.getElementById('mfa-code');
            if(mfaInput) mfaInput.focus();
        }, 100);

    } catch (err) {
        console.error("Login Exception:", err);
        alert("Terjadi kesalahan koneksi ke server Supabase.");
    }
}

function prepareAuthenticator(account) {
    const qrContainer = document.getElementById('qr-container');
    const qrDiv = document.getElementById('qrcode');
    const instruction = document.getElementById('mfa-instruction');
    if(!qrDiv) return;
    
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
    const codeInput = document.getElementById('mfa-code');
    if(!codeInput) return;
    const code = codeInput.value.trim();
    
    if (code.length === 6 && !isNaN(code)) {
        if (!currentUser.is_2fa_setup) {
            await supabaseClient
                .from('app_users')
                .update({ is_2fa_setup: true })
                .eq('id', currentUser.id);
            currentUser.is_2fa_setup = true;
        }
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
        alert("Gagal Reset: Username tersebut tidak ditemukan di database Supabase.");
    } else {
        alert("Reset Password Berhasil! Silakan login kembali dengan password baru.");
        toggleAuth('login');
    }
}

function logout() {
    currentUser = null;
    document.getElementById('app-section').classList.add('hidden');
    document.getElementById('auth-section').classList.remove('hidden');
    document.querySelectorAll('.input-form').forEach(el => el.value = '');
    toggleAuth('login');
}

// ==========================================
// 2. SHORTCUT TOMBOL ENTER (KEYBOARD)
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const loginUser = document.getElementById('login-user');
    const loginPass = document.getElementById('login-pass');
    const mfaCode = document.getElementById('mfa-code');
    const resetUser = document.getElementById('reset-user');
    const resetPass = document.getElementById('reset-pass');
    const searchInput = document.getElementById('search-input');

    if(loginUser) loginUser.addEventListener('keypress', e => { if(e.key === 'Enter') loginPass.focus(); });
    if(loginPass) loginPass.addEventListener('keypress', e => { if(e.key === 'Enter') handleLogin(); });
    if(mfaCode) mfaCode.addEventListener('keypress', e => { if(e.key === 'Enter') handle2FA(); });
    if(resetUser) resetUser.addEventListener('keypress', e => { if(e.key === 'Enter') resetPass.focus(); });
    if(resetPass) resetPass.addEventListener('keypress', e => { if(e.key === 'Enter') handleReset(); });
    if(searchInput) searchInput.addEventListener('keypress', e => { if(e.key === 'Enter') searchDevice(); });
});

// ==========================================
// 3. DASHBOARD & INISIALISASI
// ==========================================
async function initApp() {
    if(!currentUser) return;
    const badge = document.getElementById('login-role-badge');
    if(badge) badge.innerText = `[ ${currentUser.role} ]`;

    const adminTab = document.getElementById('tab-btn-admin');
    if(currentUser.role === 'Admin') {
        if(adminTab) adminTab.style.display = 'inline-block';
        renderUsers();
    } else {
        if(adminTab) adminTab.style.display = 'none';
        switchTab('device');
    }

    await renderDevices();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const targetTab = document.getElementById(`tab-${tabName}`);
    if(targetTab) targetTab.classList.add('active');
    
    // Aktifkan tombol tab visual
    if(event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
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

// ==========================================
// 4. CRUD DEVICES (PERBAIKAN TANGGAL DEPLOY)
// ==========================================
function getStatusBadge(status) {
    if(status === 'Belum di setup') return `<span class="badge badge-belum">${status}</span>`;
    if(status === 'On progress') return `<span class="badge badge-progress">${status}</span>`;
    if(status === 'Done setup') return `<span class="badge badge-setup">${status}</span>`;
    if(status === 'Done deploy user') return `<span class="badge badge-deploy">${status}</span>`;
    return status;
}

async function renderDevices(filterText = '') {
    const { data: devices, error } = await supabaseClient.from('devices').select('*').order('id', { ascending: false });
    if (error) { console.error(error); return; }

    const tbody = document.getElementById('table-device');
    if(!tbody) return;
    tbody.innerHTML = '';

    const filtered = (devices || []).filter(d => 
        (d.nama && d.nama.toLowerCase().includes(filterText.toLowerCase())) || 
        (d.sn && d.sn.toLowerCase().includes(filterText.toLowerCase()))
    );

    filtered.forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td>${d.nama || ''}</td>
                <td>${d.sn || ''}</td>
                <td>${d.email || ''}</td>
                <td>${d.alamat || ''}</td>
                <td>${d.tanggal || ''}</td>
                <td>${getStatusBadge(d.status)}</td>
                <td>
                    <button class="btn btn-warning" style="padding:5px 10px; font-size:11px;" onclick="editDevice(${d.id})">Edit</button>
                    <button class="btn btn-danger" style="padding:5px 10px; font-size:11px;" onclick="deleteDevice(${d.id})">Hapus</button>
                </td>
            </tr>
        `;
    });
    updateDashboardStats();
}

async function searchDevice() {
    const searchInput = document.getElementById('search-input');
    if(searchInput) renderDevices(searchInput.value);
}

// Fungsi Simpan/Update Device (Memastikan format tanggal YYYY-MM-DD tersimpan dengan benar)
async function saveDevice() {
    const id = document.getElementById('dev-id').value;
    const tanggalVal = document.getElementById('dev-tgl').value; // Mengambil nilai dari input type="date"

    const data = {
        nama: document.getElementById('dev-nama').value.trim(),
        sn: document.getElementById('dev-sn').value.trim(),
        email: document.getElementById('dev-email').value.trim(),
        alamat: document.getElementById('dev-alamat').value.trim(),
        tanggal: tanggalVal || new Date().toISOString().split('T')[0], // Jika kosong, set tanggal hari ini
        status: document.getElementById('dev-status').value
    };

    if (id) {
        const { error } = await supabaseClient.from('devices').update(data).eq('id', id);
        if(error) alert("Gagal update device: " + error.message);
    } else {
        const { error } = await supabaseClient.from('devices').insert([data]);
        if(error) alert("Gagal menambah device: " + error.message);
    }
    
    closeModal('modal-device');
    renderDevices();
}

// Fungsi Edit Device (Memuat kembali tanggal ke input date form)
async function editDevice(id) {
    const { data, error } = await supabaseClient.from('devices').select('*').eq('id', id).single();
    if(error || !data) {
        alert("Gagal mengambil data device.");
        return;
    }

    document.getElementById('title-device').innerText = 'Edit Status & Data Deploy';
    document.getElementById('dev-id').value = data.id;
    document.getElementById('dev-nama').value = data.nama || '';
    document.getElementById('dev-sn').value = data.sn || '';
    document.getElementById('dev-email').value = data.email || '';
    document.getElementById('dev-alamat').value = data.alamat || '';
    
    // Pastikan format tanggal masuk ke input date HTML (YYYY-MM-DD)
    document.getElementById('dev-tgl').value = data.tanggal || ''; 
    
    document.getElementById('dev-status').value = data.status || 'Belum di setup';
    document.getElementById('modal-device').classList.remove('hidden');
}

async function deleteDevice(id) {
    if(confirm("Apakah Anda yakin ingin menghapus data device ini dari cloud?")) {
        const { error } = await supabaseClient.from('devices').delete().eq('id', id);
        if(error) alert("Gagal menghapus: " + error.message);
        renderDevices();
    }
}

// ==========================================
// 5. CRUD USERS (SUPABASE)
// ==========================================
async function renderUsers() {
    const { data: users, error } = await supabaseClient.from('app_users').select('*');
    if(error) return;
    
    const tbody = document.getElementById('table-user');
    if(!tbody) return;
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
    const user = document.getElementById('usr-name').value.trim();
    const pass = document.getElementById('usr-pass').value.trim();
    const role = document.getElementById('usr-role').value;

    if(!user || !pass) return alert("Username & Password harus diisi!");

    const data = { username: user, password: pass, role: role };

    if (id) {
        const { error } = await supabaseClient.from('app_users').update(data).eq('id', id);
        if(error) alert("Gagal update user: " + error.message);
    } else {
        const { error } = await supabaseClient.from('app_users').insert([{ ...data, is_2fa_setup: false }]);
        if(error) alert("Gagal menambah user: " + error.message);
    }

    closeModal('modal-user');
    renderUsers();
}

async function editUser(id) {
    const { data, error } = await supabaseClient.from('app_users').select('*').eq('id', id).single();
    if(error || !data) return;

    document.getElementById('title-user').innerText = 'Edit Akses User Cloud';
    document.getElementById('usr-id').value = data.id;
    document.getElementById('usr-name').value = data.username || '';
    document.getElementById('usr-pass').value = data.password || '';
    document.getElementById('usr-role').value = data.role || 'Member';
    document.getElementById('modal-user').classList.remove('hidden');
}

async function deleteUser(id) {
    if(confirm("Hapus hak akses user ini dari cloud?")) {
        const { error } = await supabaseClient.from('app_users').delete().eq('id', id);
        if(error) alert("Gagal menghapus: " + error.message);
        renderUsers();
    }
}

// ==========================================
// 6. MODALS & EXCEL EXPORT/IMPORT
// ==========================================
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if(!modal) return;
    modal.classList.remove('hidden');

    if(modalId === 'modal-device') {
        document.getElementById('title-device').innerText = 'Tambah Data Device Baru';
        document.getElementById('dev-id').value = '';
        document.getElementById('dev-nama').value = '';
        document.getElementById('dev-sn').value = '';
        document.getElementById('dev-email').value = '';
        document.getElementById('dev-alamat').value = '';
        
        // Set default tanggal hari ini pada input date saat modal tambah dibuka
        const todayStr = new Date().toISOString().split('T')[0];
        document.getElementById('dev-tgl').value = todayStr;
        
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
    const modal = document.getElementById(modalId);
    if(modal) modal.classList.add('hidden');
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
            const mappedData = importedData.map(item => ({
                nama: item.nama || '',
                sn: item.sn || '',
                email: item.email || '',
                alamat: item.alamat || '',
                tanggal: item.tanggal || new Date().toISOString().split('T')[0],
                status: item.status || 'Belum di setup'
            }));
            
            await supabaseClient.from('devices').insert(mappedData);
            renderDevices();
            alert("Berhasil mengimpor data ke Supabase Cloud!");
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
}
