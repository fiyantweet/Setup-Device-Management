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

// Cek Sesi Persisten saat Browser Dimuat
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
    const sOldInput = document.getElementById('search-old-input');

    if(lUser) lUser.addEventListener('keypress', e => { if(e.key === 'Enter') lPass.focus(); });
    if(lPass) lPass.addEventListener('keypress', e => { if(e.key === 'Enter') handleLogin(); });
    if(mCode) mCode.addEventListener('keypress', e => { if(e.key === 'Enter') handle2FA(); });
    if(rUser) rUser.addEventListener('keypress', e => { if(e.key === 'Enter') rPass.focus(); });
    if(rPass) rPass.addEventListener('keypress', e => { if(e.key === 'Enter') handleReset(); });
    if(sInput) sInput.addEventListener('keypress', e => { if(e.key === 'Enter') searchDevice(); });
    if(sOldInput) sOldInput.addEventListener('keypress', e => { if(e.key === 'Enter') renderOldDevices(); });
}

async function logActivity(username, actionText) {
    if (!supabaseClient) return;
    const timeStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
    await supabaseClient.from('activity_logs').insert([{
        username: username || 'System',
        action: actionText,
        timestamp: timeStr
    }]);
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
            await logActivity(user, "Gagal login (kredensial salah)");
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
        await logActivity(currentUser.username, "Berhasil Login ke sistem (2FA terverifikasi)");

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
        await logActivity(user, "Melakukan Reset Password akun");
        toggleAuth('login');
    }
}

function logout() {
    if(currentUser) {
        logActivity(currentUser.username, "Logout dari sistem");
    }
    supabaseClient.removeAllChannels(); // Bersihkan Realtime saat logout
    currentUser = null;
    localStorage.removeItem('autopilot_current_user');
    document.getElementById('app-section').classList.add('hidden');
    document.getElementById('auth-section').classList.remove('hidden');
    document.querySelectorAll('.input-form').forEach(el => el.value = '');
    toggleAuth('login');
}

// ==========================================
// 2. INISIALISASI & DASHBOARD TABS
// ==========================================
async function initApp() {
    if(!currentUser) return;
    document.getElementById('login-role-badge').innerText = `[ ${currentUser.role} ]`;

    if(currentUser.role === 'Admin') {
        document.getElementById('tab-btn-location').style.display = 'inline-block';
        document.getElementById('tab-btn-admin').style.display = 'inline-block';
        renderUsers();
    } else {
        document.getElementById('tab-btn-location').style.display = 'none';
        document.getElementById('tab-btn-admin').style.display = 'none';
    }

    await loadLocationOptions();
    await renderDevices();
    await renderOldDevices();
    await renderIncidents();
    if(currentUser.role === 'Admin') renderLocations();
    
    // Inisialisasi Fungsi Realtime dari Supabase
    setupRealtimeSubscriptions();
}

function setupRealtimeSubscriptions() {
    // Berlangganan perubahan Realtime pada tabel public
    supabaseClient.channel('custom-all-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'devices' }, payload => {
            renderDevices();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'old_devices' }, payload => {
            renderOldDevices();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'incident_summaries' }, payload => {
            renderIncidents();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, payload => {
            loadLocationOptions();
            if(currentUser && currentUser.role === 'Admin') renderLocations();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_users' }, payload => {
            if(currentUser && currentUser.role === 'Admin') renderUsers();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_logs' }, payload => {
            // Update modal aktivitas otomatis jika sedang terbuka
            const modalActivity = document.getElementById('modal-activity');
            if (!modalActivity.classList.contains('hidden')) {
                const devTabHidden = document.getElementById('act-tab-device').classList.contains('hidden');
                if(!devTabHidden){
                    switchActivityTab('device');
                } else {
                    switchActivityTab('login');
                }
            }
        })
        .subscribe();
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById('stat-view-1').classList.add('hidden');
    document.getElementById('stat-view-2').classList.add('hidden');

    if (tabName === 'device') {
        document.getElementById('stat-view-1').classList.remove('hidden');
    } else if (tabName === 'old-device') {
        document.getElementById('stat-view-2').classList.remove('hidden');
    }

    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.currentTarget.classList.add('active');
}

async function loadLocationOptions() {
    const { data: locations } = await supabaseClient.from('locations').select('*').order('nama', { ascending: true });
    
    const filterLoc = document.getElementById('filter-location-select');
    const filterOldLoc = document.getElementById('filter-old-location-select');
    const devLoc = document.getElementById('dev-lokasi');
    const oldLoc = document.getElementById('old-lokasi-input');

    const currentFilterVal = filterLoc ? filterLoc.value : 'All';
    const currentOldFilterVal = filterOldLoc ? filterOldLoc.value : 'All';
    const currentDevVal = devLoc ? devLoc.value : '-';
    const currentOldVal = oldLoc ? oldLoc.value : '-';

    if (filterLoc) filterLoc.innerHTML = '<option value="All">Lokasi: Semua</option>';
    if (filterOldLoc) filterOldLoc.innerHTML = '<option value="All">Lokasi: Semua</option>';
    if (devLoc) devLoc.innerHTML = '<option value="-">Pilih Lokasi / Kota</option>';
    if (oldLoc) oldLoc.innerHTML = '<option value="-">Pilih Lokasi / Kota</option>';

    if (locations) {
        locations.forEach(l => {
            const optHtml = `<option value="${l.nama}">${l.nama}</option>`;
            if (filterLoc) filterLoc.innerHTML += optHtml;
            if (filterOldLoc) filterOldLoc.innerHTML += optHtml;
            if (devLoc) devLoc.innerHTML += optHtml;
            if (oldLoc) oldLoc.innerHTML += optHtml;
        });
    }

    if (filterLoc) filterLoc.value = currentFilterVal;
    if (filterOldLoc) filterOldLoc.value = currentOldFilterVal;
    if (devLoc) devLoc.value = currentDevVal;
    if (oldLoc) oldLoc.value = currentOldVal;
}

async function updateDashboardStats(devices = null) {
    if(!devices) {
        const { data } = await supabaseClient.from('devices').select('*');
        devices = data || [];
    }
    
    document.getElementById('stat-total').innerText = devices.length;
    document.getElementById('stat-belum').innerText = devices.filter(d => d.status === 'Belum di setup').length;
    document.getElementById('stat-progress').innerText = devices.filter(d => d.status === 'On progress').length;
    document.getElementById('stat-setup').innerText = devices.filter(d => d.status === 'Done setup').length;
    document.getElementById('stat-deploy').innerText = devices.filter(d => d.status === 'Done deploy user').length;
}

async function updateOldDashboardStats(oldDevices = null) {
    if(!oldDevices){
        const { data } = await supabaseClient.from('old_devices').select('*');
        oldDevices = data || [];
    }

    document.getElementById('old-stat-total').innerText = oldDevices.length;
    document.getElementById('old-stat-done').innerText = oldDevices.filter(d => d.status_bast === 'done BAST').length;
    document.getElementById('old-stat-pending').innerText = oldDevices.filter(d => d.status_bast === 'pending BAST').length;
    document.getElementById('old-stat-belum').innerText = oldDevices.filter(d => d.status_bast === 'belum BAST').length;
    document.getElementById('old-stat-kembali').innerText = oldDevices.filter(d => d.status_pengembalian === 'sudah').length;
}

function setStatFilter(status) {
    document.getElementById('filter-status-select').value = status;
    renderDevices();
}

function setOldBastFilter(bastStatus) {
    document.getElementById('filter-bast-select').value = bastStatus;
    renderOldDevices();
}

function formatTanggalIndo(dateString) {
    if (!dateString) return '-';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    const [year, month, day] = parts;
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
}

// ==========================================
// 3. CRUD DEVICES (DEPLOY)
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

    const selectedStatus = document.getElementById('filter-status-select').value;
    if (selectedStatus !== 'All') {
        list = list.filter(d => d.status === selectedStatus);
    }

    const selectedLocation = document.getElementById('filter-location-select').value;
    if (selectedLocation !== 'All') {
        list = list.filter(d => d.lokasi === selectedLocation);
    }

    const searchVal = document.getElementById('search-input').value.toLowerCase().trim();
    if (searchVal) {
        list = list.filter(d => 
            (d.nama && d.nama.toLowerCase().includes(searchVal)) || 
            (d.sn && d.sn.toLowerCase().includes(searchVal)) ||
            (d.email && d.email.toLowerCase().includes(searchVal))
        );
    }

    const sortVal = document.getElementById('sort-date-select').value;
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
                <td>${d.nama || ''}</td>
                <td><strong>${d.sn || ''}</strong></td>
                <td>${d.email || ''}</td>
                <td><span class="badge badge-setup" style="background:#222; color:var(--primary);">${d.team || '-'}</span></td>
                <td><span class="badge badge-setup" style="background:#181818; color:var(--warning); border:1px solid var(--border);">${d.lokasi || '-'}</span></td>
                <td>${d.alamat || ''}</td>
                <td><strong>${formatTanggalIndo(d.tanggal)}</strong></td>
                <td>${getStatusBadge(d.status)}</td>
                <td>
                    <button class="btn btn-warning" style="padding:4px 6px; font-size:11px;" onclick="editDevice(${d.id})">Edit</button>
                    <button class="btn btn-clear" style="padding:4px 6px; font-size:11px;" onclick="clearHistory(${d.id})" title="Reset Riwayat">Clr</button>
                    <button class="btn btn-danger" style="padding:4px 6px; font-size:11px;" onclick="deleteDevice(${d.id})">Del</button>
                </td>
            </tr>
        `;
    });
    updateDashboardStats(devices);
}

async function searchDevice() {
    renderDevices();
}

async function saveDevice() {
    const id = document.getElementById('dev-id').value;
    const nama = document.getElementById('dev-nama').value.trim();
    const sn = document.getElementById('dev-sn').value.trim();
    const email = document.getElementById('dev-email').value.trim();
    const team = document.getElementById('dev-team').value;
    const lokasi = document.getElementById('dev-lokasi').value;
    const alamat = document.getElementById('dev-alamat').value.trim();
    const tanggal = document.getElementById('dev-tgl').value;
    const status = document.getElementById('dev-status').value;

    if (!nama || !sn || !email) {
        alert("Nama User, Serial Number, dan Email wajib diisi!");
        return;
    }

    const { data: allDevices } = await supabaseClient.from('devices').select('*');
    const duplicateSN = allDevices.find(d => d.sn.toLowerCase() === sn.toLowerCase() && d.id != id);
    const duplicateEmail = allDevices.find(d => d.email.toLowerCase() === email.toLowerCase() && d.id != id);

    if (duplicateSN) {
        alert(`Duplicate Values Warning: Serial Number "${sn}" sudah terdaftar!`);
        return;
    }
    if (duplicateEmail) {
        alert(`Duplicate Values Warning: Email "${email}" sudah terdaftar!`);
        return;
    }

    const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

    if (id) {
        const { data: oldData } = await supabaseClient.from('devices').select('history, status').eq('id', id).single();
        let historyLog = oldData?.history || '';
        
        if (oldData?.status !== status) {
            const newUpdate = `• Status diubah ke <strong>${status}</strong> oleh <em>${currentUser.username}</em> (${nowStr})`;
            historyLog = historyLog ? newUpdate + '<br>' + historyLog : newUpdate;
        }

        await supabaseClient.from('devices').update({
            nama, sn, email, team, lokasi, alamat, tanggal, status, history: historyLog
        }).eq('id', id);

        await logActivity(currentUser.username, `Mengupdate data device SN: ${sn}`);
    } else {
        const newHistory = `• Data dibuat oleh <em>${currentUser.username}</em> pada ${nowStr}`;
        await supabaseClient.from('devices').insert([{
            nama, sn, email, team, lokasi, alamat, tanggal, status, history: newHistory
        }]);

        await logActivity(currentUser.username, `Menambah device baru SN: ${sn}`);
    }
    
    closeModal('modal-device');
    // renderDevices() akan dipanggil otomatis oleh fungsi realtime subscriptions
}

async function editDevice(id) {
    const { data } = await supabaseClient.from('devices').select('*').eq('id', id).single();
    if(data) {
        document.getElementById('title-device').innerText = 'Edit Status & Data Deploy';
        document.getElementById('dev-id').value = data.id;
        document.getElementById('dev-nama').value = data.nama;
        document.getElementById('dev-sn').value = data.sn;
        document.getElementById('dev-email').value = data.email;
        document.getElementById('dev-team').value = data.team || '-';
        document.getElementById('dev-lokasi').value = data.lokasi || '-';
        document.getElementById('dev-alamat').value = data.alamat;
        document.getElementById('dev-tgl').value = data.tanggal;
        document.getElementById('dev-status').value = data.status;
        document.getElementById('modal-device').classList.remove('hidden');
    }
}

async function clearHistory(id) {
    if(confirm("Reset Riwayat Status Update untuk device ini?")) {
        const nowStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
        await supabaseClient.from('devices').update({ history: `• Riwayat direset oleh ${currentUser.username} pada ${nowStr}` }).eq('id', id);
    }
}

async function deleteDevice(id) {
    if(confirm("Hapus data device ini dari cloud?")) {
        await supabaseClient.from('devices').delete().eq('id', id);
    }
}

// ==========================================
// 4. REPORT STATUS DEVICE LAMA
// ==========================================
function getBastBadge(bast) {
    if(bast === 'done BAST') return `<span class="badge badge-bast-done">Done BAST</span>`;
    if(bast === 'pending BAST') return `<span class="badge badge-bast-pending">Pending BAST</span>`;
    return `<span class="badge badge-bast-belum">Belum BAST</span>`;
}

function getReturnBadge(ret) {
    if(ret === 'sudah') return `<span class="badge badge-return-sudah">Sudah</span>`;
    return `<span class="badge badge-return-belum">Belum</span>`;
}

async function renderOldDevices() {
    const { data: oldList, error } = await supabaseClient.from('old_devices').select('*');
    if (error) { console.error(error); return; }

    const tbody = document.getElementById('table-old-device');
    tbody.innerHTML = '';

    let list = oldList || [];

    const locFilter = document.getElementById('filter-old-location-select').value;
    if (locFilter !== 'All') {
        list = list.filter(d => d.lokasi === locFilter);
    }

    const bastFilter = document.getElementById('filter-bast-select').value;
    if (bastFilter !== 'All') {
        list = list.filter(d => d.status_bast === bastFilter);
    }

    const returnFilter = document.getElementById('filter-return-select').value;
    if (returnFilter !== 'All') {
        list = list.filter(d => d.status_pengembalian === returnFilter);
    }

    const searchVal = document.getElementById('search-old-input').value.toLowerCase().trim();
    if (searchVal) {
        list = list.filter(d => 
            (d.sn && d.sn.toLowerCase().includes(searchVal)) || 
            (d.nama && d.nama.toLowerCase().includes(searchVal)) ||
            (d.divisi && d.divisi.toLowerCase().includes(searchVal)) ||
            (d.lokasi && d.lokasi.toLowerCase().includes(searchVal))
        );
    }

    list.forEach(d => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${d.sn || ''}</strong></td>
                <td>${d.nama || ''}</td>
                <td>${d.email || ''}</td>
                <td><span class="badge badge-setup" style="background:#181818; color:var(--warning); border:1px solid var(--border);">${d.lokasi || '-'}</span></td>
                <td>${d.divisi || ''}</td>
                <td><strong>${formatTanggalIndo(d.tanggal)}</strong></td>
                <td>${getReturnBadge(d.status_pengembalian)}</td>
                <td>${getBastBadge(d.status_bast)}</td>
                <td>
                    <button class="btn btn-warning" style="padding:4px 6px; font-size:11px;" onclick="editOldDevice(${d.id})">Edit</button>
                    <button class="btn btn-danger" style="padding:4px 6px; font-size:11px;" onclick="deleteOldDevice(${d.id})">Del</button>
                </td>
            </tr>
        `;
    });
    updateOldDashboardStats(oldList);
}

async function saveOldDevice() {
    const id = document.getElementById('old-id').value;
    const sn = document.getElementById('old-sn').value.trim();
    const nama = document.getElementById('old-nama').value.trim();
    const email = document.getElementById('old-email').value.trim();
    const lokasi = document.getElementById('old-lokasi-input').value;
    const divisi = document.getElementById('old-divisi').value.trim();
    const tanggal = document.getElementById('old-tanggal').value;
    const status_pengembalian = document.getElementById('old-pengembalian').value;
    const status_bast = document.getElementById('old-bast').value;

    if (!sn || !nama) {
        alert("SN dan Nama User wajib diisi!");
        return;
    }

    const data = { sn, nama, email, lokasi, divisi, tanggal, status_pengembalian, status_bast };

    if (id) {
        await supabaseClient.from('old_devices').update(data).eq('id', id);
        await logActivity(currentUser.username, `Mengupdate data device lama SN: ${sn}`);
    } else {
        await supabaseClient.from('old_devices').insert([data]);
        await logActivity(currentUser.username, `Menambah data device lama SN: ${sn}`);
    }

    closeModal('modal-old-device');
}

async function editOldDevice(id) {
    const { data } = await supabaseClient.from('old_devices').select('*').eq('id', id).single();
    if(data) {
        document.getElementById('title-old-device').innerText = 'Edit Status Device Lama';
        document.getElementById('old-id').value = data.id;
        document.getElementById('old-sn').value = data.sn;
        document.getElementById('old-nama').value = data.nama;
        document.getElementById('old-email').value = data.email;
        document.getElementById('old-lokasi-input').value = data.lokasi || '-';
        document.getElementById('old-divisi').value = data.divisi;
        document.getElementById('old-tanggal').value = data.tanggal;
        document.getElementById('old-pengembalian').value = data.status_pengembalian;
        document.getElementById('old-bast').value = data.status_bast;
        document.getElementById('modal-old-device').classList.remove('hidden');
    }
}

async function deleteOldDevice(id) {
    if(confirm("Hapus data device lama ini?")) {
        await supabaseClient.from('old_devices').delete().eq('id', id);
    }
}

async function exportOldExcel() {
    const { data: oldDevices } = await supabaseClient.from('old_devices').select('*');
    if (!oldDevices || oldDevices.length === 0) return alert("Belum ada data untuk di-export.");
    const worksheet = XLSX.utils.json_to_sheet(oldDevices);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "DeviceLama");
    XLSX.writeFile(workbook, "Report_Status_Device_Lama.xlsx");
    await logActivity(currentUser.username, "Mengekspor data device lama ke Excel");
}

// ==========================================
// 5. INCIDENT SUMMARY
// ==========================================
async function renderIncidents() {
    const { data: list, error } = await supabaseClient.from('incident_summaries').select('*').order('tanggal', { ascending: false });
    if (error) { console.error(error); return; }

    const tbody = document.getElementById('table-incident');
    tbody.innerHTML = '';

    (list || []).forEach(item => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${formatTanggalIndo(item.tanggal)}</strong></td>
                <td>${item.incident || '-'}</td>
                <td>${item.problem_deployment || '-'}</td>
                <td>${item.catatan || '-'}</td>
                <td>
                    <button class="btn btn-warning" style="padding:4px 6px; font-size:11px;" onclick="editIncident(${item.id})">Edit</button>
                    <button class="btn btn-danger" style="padding:4px 6px; font-size:11px;" onclick="deleteIncident(${item.id})">Del</button>
                </td>
            </tr>
        `;
    });
}

async function saveIncident() {
    const id = document.getElementById('inc-id').value;
    const tanggal = document.getElementById('inc-tanggal').value;
    const incident = document.getElementById('inc-incident').value.trim();
    const problem_deployment = document.getElementById('inc-problem').value.trim();
    const catatan = document.getElementById('inc-catatan').value.trim();

    if (!tanggal) {
        alert("Tanggal wajib diisi!");
        return;
    }

    const data = { tanggal, incident, problem_deployment, catatan };

    if (id) {
        await supabaseClient.from('incident_summaries').update(data).eq('id', id);
        await logActivity(currentUser.username, `Mengupdate incident summary ID: ${id}`);
    } else {
        await supabaseClient.from('incident_summaries').insert([data]);
        await logActivity(currentUser.username, `Menambah incident summary baru`);
    }

    closeModal('modal-incident');
}

async function editIncident(id) {
    const { data } = await supabaseClient.from('incident_summaries').select('*').eq('id', id).single();
    if(data) {
        document.getElementById('title-incident').innerText = 'Edit Incident & Problem Deployment';
        document.getElementById('inc-id').value = data.id;
        document.getElementById('inc-tanggal').value = data.tanggal;
        document.getElementById('inc-incident').value = data.incident;
        document.getElementById('inc-problem').value = data.problem_deployment;
        document.getElementById('inc-catatan').value = data.catatan;
        document.getElementById('modal-incident').classList.remove('hidden');
    }
}

async function deleteIncident(id) {
    if(confirm("Hapus ringkasan incident ini?")) {
        await supabaseClient.from('incident_summaries').delete().eq('id', id);
    }
}

// ==========================================
// 6. KELOLA MASTER LOKASI / KOTA (ADMIN)
// ==========================================
async function renderLocations() {
    const { data: locations, error } = await supabaseClient.from('locations').select('*').order('nama', { ascending: true });
    if (error) { console.error(error); return; }

    const tbody = document.getElementById('table-location');
    tbody.innerHTML = '';

    (locations || []).forEach(l => {
        tbody.innerHTML += `
            <tr>
                <td><strong>${l.nama}</strong></td>
                <td>${l.keterangan || '-'}</td>
                <td>
                    <button class="btn btn-warning" style="padding:4px 6px; font-size:11px;" onclick="editLocation(${l.id})">Edit</button>
                    <button class="btn btn-danger" style="padding:4px 6px; font-size:11px;" onclick="deleteLocation(${l.id}, '${l.nama}')">Del</button>
                </td>
            </tr>
        `;
    });
}

async function saveLocation() {
    const id = document.getElementById('loc-id').value;
    const nama = document.getElementById('loc-nama').value.trim();
    const keterangan = document.getElementById('loc-ket').value.trim();

    if (!nama) {
        alert("Nama Lokasi / Kota wajib diisi!");
        return;
    }

    const data = { nama, keterangan };

    if (id) {
        await supabaseClient.from('locations').update(data).eq('id', id);
        await logActivity(currentUser.username, `Mengupdate lokasi: ${nama}`);
    } else {
        await supabaseClient.from('locations').insert([data]);
        await logActivity(currentUser.username, `Menambah lokasi baru: ${nama}`);
    }

    closeModal('modal-location');
}

async function editLocation(id) {
    const { data } = await supabaseClient.from('locations').select('*').eq('id', id).single();
    if(data) {
        document.getElementById('title-location').innerText = 'Edit Master Lokasi / Kota';
        document.getElementById('loc-id').value = data.id;
        document.getElementById('loc-nama').value = data.nama;
        document.getElementById('loc-ket').value = data.keterangan || '';
        document.getElementById('modal-location').classList.remove('hidden');
    }
}

async function deleteLocation(id, nama) {
    if(confirm(`Hapus lokasi "${nama}" dari master data?`)) {
        await supabaseClient.from('locations').delete().eq('id', id);
        await logActivity(currentUser.username, `Menghapus lokasi: ${nama}`);
    }
}

// ==========================================
// 7. ADMIN: RESET SEMUA DATA DATABASE
// ==========================================
async function confirmResetDatabase() {
    if (!currentUser || currentUser.role !== 'Admin') {
        alert("Akses ditolak! Fitur Reset Semua Data hanya dapat diakses oleh user dengan role Admin.");
        return;
    }

    const confirm1 = prompt("PERINGATAN KERAS!\nApakah kamu yakin hapus semua data?\nKetik 'Ya' untuk melanjutkan atau 'Tidak' untuk membatalkan:");
    
    if (confirm1 && confirm1.trim().toLowerCase() === 'ya') {
        const confirm2 = confirm("KONFIRMASI AKHIR: Seluruh data di database (Devices, Device Lama, Incident, Lokasi) akan dihapus permanen. Lanjutkan?");
        if (confirm2) {
            try {
                await supabaseClient.from('devices').delete().neq('id', 0);
                await supabaseClient.from('old_devices').delete().neq('id', 0);
                await supabaseClient.from('incident_summaries').delete().neq('id', 0);
                await supabaseClient.from('locations').delete().neq('id', 0);
                await supabaseClient.from('activity_logs').delete().neq('id', 0);

                await logActivity(currentUser.username, "MELAKUKAN RESET SEMUA DATA DATABASE");
                alert("Semua data di database berhasil direset/dikosongkan!");
                initApp();
            } catch (err) {
                console.error(err);
                alert("Terjadi kesalahan saat mereset database.");
            }
        } else {
            alert("Reset database dibatalkan.");
        }
    } else {
        alert("Reset database dibatalkan.");
    }
}

// ==========================================
// 8. RIWAYAT AKTIVITAS & MODAL
// ==========================================
async function openActivityModal() {
    document.getElementById('modal-activity').classList.remove('hidden');
    switchActivityTab('device');
}

async function switchActivityTab(tab) {
    const devTab = document.getElementById('act-tab-device');
    const loginTab = document.getElementById('act-tab-login');
    const btnDev = document.getElementById('btn-act-dev');
    const btnLogin = document.getElementById('btn-act-login');

    if (tab === 'device') {
        devTab.classList.remove('hidden');
        loginTab.classList.add('hidden');
        btnDev.className = 'btn btn-primary';
        btnLogin.className = 'btn btn-secondary';

        const { data: devices } = await supabaseClient.from('devices').select('nama, sn, history');
        const tbody = document.getElementById('table-activity-device');
        tbody.innerHTML = '';
        if (devices) {
            devices.forEach(d => {
                tbody.innerHTML += `
                    <tr>
                        <td><strong>${d.nama}</strong><br><small class="text-muted">SN: ${d.sn}</small></td>
                        <td><div class="history-container-modal">${d.history || 'Belum ada riwayat.'}</div></td>
                    </tr>
                `;
            });
        }
    } else {
        devTab.classList.add('hidden');
        loginTab.classList.remove('hidden');
        btnDev.className = 'btn btn-secondary';
        btnLogin.className = 'btn btn-primary';

        const { data: logs } = await supabaseClient.from('activity_logs').select('*').order('id', { ascending: false });
        const tbody = document.getElementById('table-activity-login');
        tbody.innerHTML = '';
        if (logs) {
            logs.forEach(l => {
                tbody.innerHTML += `
                    <tr>
                        <td><small>${l.timestamp}</small></td>
                        <td><strong class="text-primary">${l.username}</strong></td>
                        <td>${l.action}</td>
                    </tr>
                `;
            });
        }
    }
}

// ==========================================
// 9. CRUD USERS & RESET 2FA
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
                    <button class="btn btn-warning" style="padding:4px 8px; font-size:11px;" onclick="editUser(${u.id})">Edit</button>
                    <button class="btn btn-info" style="padding:4px 8px; font-size:11px;" onclick="resetUser2FA(${u.id}, '${u.username}')" title="Reset 2FA">Reset 2FA</button>
                    ${users.length > 1 ? `<button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" onclick="deleteUser(${u.id}, '${u.username}')">Hapus</button>` : `<span class="badge" style="background:#333;color:#fff;">Default</span>`}
                </td>
            </tr>
        `;
    });
}

async function resetUser2FA(id, uname) {
    if(confirm(`Reset 2FA untuk user "${uname}"?`)) {
        const { error } = await supabaseClient.from('app_users').update({ is_2fa_setup: false }).eq('id', id);
        if(!error) {
            alert("Status 2FA berhasil direset!");
            await logActivity(currentUser.username, `Merreset status 2FA user: ${uname}`);
        }
    }
}

async function saveUser() {
    const id = document.getElementById('usr-id').value;
    const user = document.getElementById('usr-name').value.trim();
    const pass = document.getElementById('usr-pass').value.trim();
    const role = document.getElementById('usr-role').value;

    if(!user || !pass) return alert("Username & Password harus diisi!");

    const data = { username: user, password: pass, role: role };

    if (id) {
        await supabaseClient.from('app_users').update(data).eq('id', id);
        await logActivity(currentUser.username, `Mengupdate user: ${user}`);
    } else {
        await supabaseClient.from('app_users').insert([{ ...data, is_2fa_setup: false }]);
        await logActivity(currentUser.username, `Menambah user: ${user}`);
    }

    closeModal('modal-user');
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

async function deleteUser(id, uname) {
    if(confirm(`Hapus user "${uname}"?`)) {
        await supabaseClient.from('app_users').delete().eq('id', id);
        await logActivity(currentUser.username, `Menghapus user: ${uname}`);
    }
}

// ==========================================
// 10. MODALS & EXCEL EXPORT/IMPORT
// ==========================================
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
    const todayStr = new Date().toISOString().split('T')[0];

    if(modalId === 'modal-device') {
        document.getElementById('title-device').innerText = 'Form Deploy Device';
        document.getElementById('dev-id').value = '';
        document.getElementById('dev-nama').value = '';
        document.getElementById('dev-sn').value = '';
        document.getElementById('dev-email').value = '';
        document.getElementById('dev-team').value = '-';
        document.getElementById('dev-lokasi').value = '-';
        document.getElementById('dev-alamat').value = '';
        document.getElementById('dev-tgl').value = todayStr;
        document.getElementById('dev-status').value = 'Belum di setup';
    } else if(modalId === 'modal-old-device') {
        document.getElementById('title-old-device').innerText = 'Form Report Status Device Lama';
        document.getElementById('old-id').value = '';
        document.getElementById('old-sn').value = '';
        document.getElementById('old-nama').value = '';
        document.getElementById('old-email').value = '';
        document.getElementById('old-lokasi-input').value = '-';
        document.getElementById('old-divisi').value = '';
        document.getElementById('old-tanggal').value = todayStr;
        document.getElementById('old-pengembalian').value = 'belum';
        document.getElementById('old-bast').value = 'belum BAST';
    } else if(modalId === 'modal-incident') {
        document.getElementById('title-incident').innerText = 'Form Incident & Problem Deployment';
        document.getElementById('inc-id').value = '';
        document.getElementById('inc-tanggal').value = todayStr;
        document.getElementById('inc-incident').value = '';
        document.getElementById('inc-problem').value = '';
        document.getElementById('inc-catatan').value = '';
    } else if(modalId === 'modal-location') {
        document.getElementById('title-location').innerText = 'Form Master Lokasi / Kota';
        document.getElementById('loc-id').value = '';
        document.getElementById('loc-nama').value = '';
        document.getElementById('loc-ket').value = '';
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
    await logActivity(currentUser.username, "Mengekspor data deploy ke Excel");
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
                team: item.team || '-',
                lokasi: item.lokasi || '-',
                alamat: item.alamat || '',
                tanggal: item.tanggal || new Date().toISOString().split('T')[0],
                status: item.status || 'Belum di setup',
                history: `• Diimpor dari Excel oleh ${currentUser.username} pada ${nowStr}`
            }));
            
            await supabaseClient.from('devices').insert(mappedData);
            await logActivity(currentUser.username, `Mengimpor ${importedData.length} data deploy dari Excel`);
            alert("Berhasil mengimpor data ke Supabase Cloud!");
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
}