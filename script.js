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
// SESI PERSISTENCE (CEK REFRESH BROWSER)
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    const savedSession = localStorage.getItem('autopilot_cloud_session');
    if (savedSession) {
        currentUser = JSON.parse(savedSession);
        document.getElementById('auth-section').classList.add('hidden');
        document.getElementById('app-section').classList.remove('hidden');
        initApp();
    }

    // Shortcut Enter Listener
    setupEnterListeners();
});

function setupEnterListeners() {
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
    if(searchInput) searchInput.addEventListener('input', () => applyFilters());
}

// ==========================================
// 1. AUTENTIKASI & 2FA
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
        alert("Harap masukkan URL dan Anon Key Supabase Anda di file script.js!");
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

        // Simpan sesi ke LocalStorage agar refresh browser tidak logout
        localStorage.setItem('autopilot_cloud_session', JSON.stringify(currentUser));

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
        alert("Gagal Reset: Username tersebut tidak ditemukan.");
    } else {
        alert("Reset Password Berhasil! Silakan login kembali.");
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
// 2. DASHBOARD & INISIALISASI APLIKASI
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

    await loadAndRenderDevices();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.currentTarget.classList.add('active');
}

// ==========================================
// 3. FORMAT TANGGAL (DD-MM-YYYY) & HISTORY
// ==========================================
function formatDateToID(dateStr) {
    if (!dateStr) return '-';
    // Format input dari type="date" adalah YYYY-MM-DD
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`; // DD-MM-YYYY
    }
    return dateStr;
}

function formatTimestamp(ts) {
    if (!ts) return '-';
    const date = new Date(ts);
    return date.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}

// ==========================================
// 4. LOAD & FILTER DEVICES (STAT CARD, STATUS, TGL)
// ==========================================
async function loadAndRenderDevices() {
    const { data: devices, error } = await supabaseClient.from('devices').select('*');
    if (error) {
        console.error("Gagal mengambil data devices:", error);
        return;
    }
    allDevicesCache = devices || [];
    updateDashboardStats();
    applyFilters();
}

function updateDashboardStats() {
    const total = allDevicesCache.length;
    const belum = allDevicesCache.filter(d => d.status === 'Belum di setup').length;
    const progress = allDevicesCache.filter(d => d.status === 'On progress').length;
    const setup = allDevicesCache.filter(d => d.status === 'Done setup').length;
    const deploy = allDevicesCache.filter(d => d.status === 'Done deploy user').length;

    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-belum').innerText = belum;
    document.getElementById('stat-progress').innerText = progress;
    document.getElementById('stat-setup').innerText = setup;
    document.getElementById('stat-deploy').innerText = deploy;
}

// Klik pada card statistik untuk filter otomatis
function filterByCard(status) {
    if (status === 'all') {
        document.getElementById('filter-status').value = 'all';
    } else {
        document.getElementById('filter-status').value = status;
    }
    applyFilters();
}

function resetFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-status').value = 'all';
    document.getElementById('filter-date').value = '';
    applyFilters();
}

function applyFilters() {
    const searchText = document.getElementById('search-input').value.toLowerCase();
    const statusFilter = document.getElementById('filter-status').value;
    const dateFilter = document.getElementById('filter-date').value; // Format YYYY-MM-DD dari input date

    const filtered = allDevicesCache.filter(d => {
        const matchSearch = (d.nama && d.nama.toLowerCase().includes(searchText)) || 
                            (d.sn && d.sn.toLowerCase().includes(searchText));
        const matchStatus = (statusFilter === 'all' || d.status === statusFilter);
        const matchDate = (!dateFilter || d.tanggal === dateFilter);

        return matchSearch && matchStatus && matchDate;
    });

    renderDeviceTable(filtered);
}

function renderDeviceTable(dataList) {
    const tbody = document.getElementById('table-device');
    tbody.innerHTML = '';

    if (dataList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Tidak ada data device yang ditemukan.</td></tr>`;
        return;
    }

    dataList.forEach(d => {
        const formattedDate = formatDateToID(d.tanggal);
        const createdInfo = formatTimestamp(d.created_at);
        const updatedInfo = formatTimestamp(d.updated_at);

        tbody.innerHTML += `
            <tr>
                <td>${d.nama || ''}</td>
                <td>${d.sn || ''}</td>
                <td>${d.email || ''}</td>
                <td>${d.alamat || ''}</td>
                <td>${formattedDate}</td>
                <td>${getStatusBadge(d.status)}</td>
                <td><small class="text-muted">Dibuat: ${createdInfo}<br>Diubah: ${updatedInfo}</small></td>
                <td>
                    <button class="btn btn-warning" style="padding:5px 10px; font-size:11px;" onclick="editDevice(${d.id})">Edit</button>
                    <button class="btn btn-danger" style="padding:5px 10px; font-size:11px;" onclick="deleteDevice(${d.id})">Hapus</button>
                </td>
            </tr>
        `;
    });
}

function getStatusBadge(status) {
    if(status === 'Belum di setup') return `<span class="badge badge-belum">${status}</span>`;
    if(status === 'On progress') return `<span class="badge badge-progress">${status}</span>`;
    if(status === 'Done setup') return `<span class="badge badge-setup">${status}</span>`;
    if(status === 'Done deploy user') return `<span class="badge badge-deploy">${status}</span>`;
    return status;
}

// ==========================================
// 5. CRUD DEVICES (SUPABASE)
// ==========================================
async function saveDevice() {
    const id = document.getElementById('dev-id').value;
    const data = {
        nama: document.getElementById('dev-nama').value,
        sn: document.getElementById('dev-sn').value,
        email: document.getElementById('dev-email').value,
        alamat: document.getElementById('dev-alamat').value,
        tanggal: document.getElementById('dev-tgl').value, // YYYY-MM-DD
        status: document.getElementById('dev-status').value,
        updated_at: new Date().toISOString()
    };

    if (id) {
        await supabaseClient.from('devices').update(data).eq('id', id);
    } else {
        data.created_at = new Date().toISOString();
        await supabaseClient.from('devices').insert([data]);
    }
    
    closeModal('modal-device');
    loadAndRenderDevices();
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
    if(confirm("Apakah Anda yakin ingin menghapus data device ini?")) {
        await supabaseClient.from('devices').delete().eq('id', id);
        loadAndRenderDevices();
    }
}

// ==========================================
// 6. CRUD USERS (ADMIN)
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
            const mappedData = importedData.map(item => ({
                nama: item.nama || '',
                sn: item.sn || '',
                email: item.email || '',
                alamat: item.alamat || '',
                tanggal: item.tanggal || new Date().toISOString().split('T')[0],
                status: item.status || 'Belum di setup',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }));
            
            await supabaseClient.from('devices').insert(mappedData);
            loadAndRenderDevices();
            alert("Berhasil mengimpor data ke Supabase Cloud!");
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
}