// PUT YOUR DEPLOYED WEB APP URL HERE
const GAS_URL = 'https://script.google.com/macros/s/AKfycbziA9QnOPwFhLhpcT_vLz7gczuDokGmPtJJR_tAJJznqSCecjXGAxsq0vIsy950YtzhjQ/exec';

function gasRun(payload) {
  return fetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
  }).then(r => r.json());
}

function gasGet(params) {
  const url = new URL(GAS_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return fetch(url.toString()).then(r => r.json());
}

$(document).ready(function () {

    // ==========================
    // SESSION CHECK (AUTO LOGIN)
    // ==========================
    const isLoggedIn = localStorage.getItem("loggedIn");

    if (isLoggedIn === "true") {
        $("#login-page").hide();
        $("#splash-screen").hide();
        $(".content").show();
        $(".sidebar").show();
        $("#usernameDisplay").text(localStorage.getItem("loggedInUser") || "");
    } else {
        $("#login-page").show();
        $("#splash-screen").hide();
        $(".content").hide();
        $(".sidebar").hide();
    }

    // ==========================
    // INITIALIZE DATATABLES
    // ==========================
    const equipmentTable = $('#equipmentTable').DataTable({
        responsive: true,
        language: {
            emptyTable: "No equipment bookings found.",
            zeroRecords: "No matching records found."
        }
    });

    const conferenceTable = $('#conferenceTable').DataTable({
        responsive: true,
        language: {
            emptyTable: "No conference room bookings found.",
            zeroRecords: "No matching records found."
        }
    });

    // Load all bookings on start
    setTimeout(loadAllBookings, 200);

    // ==========================
    // SIDEBAR NAVIGATION
    // ==========================
    $('.menu-item').not('#logoutBtn').click(function () {
        $('.menu-item').removeClass('active');
        $(this).addClass('active');

        const section = $(this).data('section');
        if (section) {
            $('.page-section').removeClass('active');
            $('#' + section).addClass('active');
        }
    });

    // ==========================
    // HAMBURGER MENU
    // ==========================
    $('#hamburgerBtn').click(function () {
        $('.sidebar').toggleClass('open');
        $('#sidebarOverlay').toggleClass('active');
    });

    $('#sidebarOverlay').click(function () {
        $('.sidebar').removeClass('open');
        $('#sidebarOverlay').removeClass('active');
    });

    // Close sidebar on menu item click (mobile)
    $('.menu-item').click(function () {
        $('.sidebar').removeClass('open');
        $('#sidebarOverlay').removeClass('active');
    });

    // ==========================
    // YEAR (FOOTER + LOGIN)
    // ==========================
    const currentYear = new Date().getFullYear();
    $('#year').text(currentYear);
    $('#footerYear').text(currentYear);

    // ==========================
    // DISABLE PAST DATES
    // ==========================
    function setMinDates() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const today = `${yyyy}-${mm}-${dd}`;
        $('input[type="date"]').attr('min', today);
    }

    setMinDates();

    // Re-apply when modals open (important for mobile)
    $('#conferenceModal, #equipmentModal').on('shown.bs.modal', function () {
        setMinDates();
    });

    // ==========================
    // FORM SUBMISSIONS
    // ==========================
    $('#equipmentForm').submit(function (e) {
        e.preventDefault();
        submitBooking('Equipment', this, equipmentTable);
    });

    $('#conferenceForm').submit(function (e) {
        e.preventDefault();
        submitBooking('Conference Room', this, conferenceTable);
    });

    // ==========================
    // SUBMIT BOOKING
    // ==========================
    function submitBooking(sheetName, form, table) {
    const formData = $(form).serializeArray().reduce((obj, item) => {
        obj[item.name] = item.value;
        return obj;
    }, {});

    if (formData.start >= formData.end) {
        Swal.fire({ icon: 'warning', title: 'Invalid Time Range',
        text: 'Time End must be after Time Start.', confirmButtonColor: '#23a645' });
        return;
    }

    Swal.fire({ title: 'Submitting booking...', allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); } });

    gasRun({ action: 'saveBooking', sheetName, formData })
        .then(res => {
        Swal.close();
        if (res.conflict) {
        Swal.fire({ icon: 'error', title: 'Time Slot Already Booked',
            html: res.message.replace(/(booked by )(.+?)( \()/, '$1<strong>$2</strong>$3'),
            confirmButtonColor: '#d33' });
        return;
        }
        $(form).trigger('reset');
        $('.modal').modal('hide');
        Swal.fire({ icon: 'success', title: 'Booking Confirmed!',
            text: 'Your booking has been recorded successfully.',
            confirmButtonColor: '#23a645' });
        loadAllBookings();
        })
        .catch(err => {
        Swal.close();
        Swal.fire({ icon: 'error', title: 'Submission Failed',
            text: 'Something went wrong. Please try again.', confirmButtonColor: '#d33' });
        console.error(err);
        });
    }

    // ==========================
    // LOAD ALL BOOKINGS
    // ==========================
    function loadAllBookings() {
    gasGet({ action: 'getAllBookings' })
        .then(data => {
        equipmentTable.clear();
        conferenceTable.clear();
        data.Equipment.forEach(row => equipmentTable.row.add(row));
        data["Conference Room"].forEach(row => conferenceTable.row.add(row));
        equipmentTable.draw(false);
        conferenceTable.draw(false);
        applyRowStyling('#equipmentTable');
        applyRowStyling('#conferenceTable');
        updateDashboardCounts();
        })
        .catch(err => console.error('Failed to load bookings:', err));
    }

    // ==========================
    // APPLY ROW STYLING
    // ==========================
    function applyRowStyling(tableSelector) {
        $(tableSelector + ' tbody tr').each(function () {
            const statusText = $(this).find('.status-badge').text().trim();
            if (statusText === 'Cancelled') {
                $(this).addClass('cancelled-row');
            } else {
                $(this).removeClass('cancelled-row');
            }
        });
    }

    // ==========================
    // CANCEL BOOKING
    // ==========================
    $('#equipmentTable, #conferenceTable').on('click', '.cancel-btn', function (event) {
        event.preventDefault();

        const $btn = $(this);
        if ($btn.prop('disabled')) return;

        const $tr = $btn.closest('tr');
        const table = $btn.closest('table').DataTable();
        const row = table.row($tr);
        let rowData = row.data();

        const tableId = $btn.closest('table').attr('id');
        const sheetName = tableId === 'equipmentTable' ? 'Equipment' : 'Conference Room';
        const sheetRow = Number($btn.data('row'));

        Swal.fire({
            title: 'Cancel this booking?',
            text: 'This action cannot be undone.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Yes, cancel it',
            cancelButtonText: 'Go back'
        }).then((result) => {
            if (!result.isConfirmed) return;

            // Show loading
            Swal.fire({
                title: 'Cancelling...',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });

            gasRun({ action: 'cancelBooking', sheetName, sheetRow })
            .then(res => {
                Swal.close();
                if (res.success) {
                rowData[8] = `<span class="status-badge cancelled">Cancelled</span>`;
                rowData[9] = `<button class="btn btn-sm btn-secondary cancel-btn" data-row="${sheetRow}" disabled>Cancelled</button>`;
                row.data(rowData).draw(false);
                $($tr).addClass('cancelled-row');
                Swal.fire({ icon: 'success', title: 'Booking Cancelled',
                    text: 'The booking has been successfully cancelled.',
                    confirmButtonColor: '#23a645' });
                updateDashboardCounts();
                }
            })
            .catch(err => {
                Swal.close();
                Swal.fire({ icon: 'error', title: 'Failed to Cancel',
                text: 'Something went wrong. Please try again.', confirmButtonColor: '#d33' });
            });
        });
    });

    // ==========================
    // DASHBOARD COUNTS
    // ==========================
    function updateDashboardCounts() {
        let conferenceBooked = 0, conferenceCancelled = 0;
        let equipmentBooked = 0, equipmentCancelled = 0;

        conferenceTable.rows().data().each(function (rowData) {
            const status = $(rowData[8]).text().trim();
            if (status === 'Booked') conferenceBooked++;
            else if (status === 'Cancelled') conferenceCancelled++;
        });

        equipmentTable.rows().data().each(function (rowData) {
            const status = $(rowData[8]).text().trim();
            if (status === 'Booked') equipmentBooked++;
            else if (status === 'Cancelled') equipmentCancelled++;
        });

        // Conference card
        $('#confActive').text(conferenceBooked);
        $('.card-summary:eq(0) .badge-active').text(conferenceBooked + ' Active');
        $('.card-summary:eq(0) .badge-cancelled').text(conferenceCancelled + ' Cancelled');

        // Equipment card
        $('#equipActive').text(equipmentBooked);
        $('.card-summary:eq(1) .badge-active').text(equipmentBooked + ' Active');
        $('.card-summary:eq(1) .badge-cancelled').text(equipmentCancelled + ' Cancelled');
    }

    // ==========================
    // LOGOUT
    // ==========================
    $('#logoutBtn').click(function () {
        Swal.fire({
            title: 'Logout?',
            text: 'You will be returned to the login screen.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Logout',
            cancelButtonText: 'Stay'
        }).then((result) => {
            if (result.isConfirmed) {
                localStorage.removeItem("loggedIn");
                location.reload();
            }
        });
    });

});


// ==========================
// LOGIN FLOW
// ==========================
document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (password === "12345") {
        localStorage.setItem("loggedIn", "true");
        localStorage.setItem("loggedInUser", username);
        startSplash();
    } else {
        Swal.fire({
            icon: 'error',
            title: 'Login Failed',
            text: 'Invalid password.',
            confirmButtonColor: '#23a645'
        });
    }
});

function startSplash() {
    const loginPage = document.getElementById('login-page');
    const splash = document.getElementById('splash-screen');

    loginPage.style.display = 'none';
    splash.style.display = 'flex';

    setTimeout(() => {
        splash.classList.add('fade-out');

        setTimeout(() => {
            splash.style.display = 'none';
            $(".content").show();
            $(".sidebar").show();
            $("#usernameDisplay").text(localStorage.getItem("loggedInUser") || "");
        }, 800);

    }, 3000);
}
