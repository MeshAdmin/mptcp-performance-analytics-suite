/**
 * Dashboard JavaScript file for MASH
 * Handles dashboard initialization, widget management, and data fetching
 */

// Global variables
let dashboard = {};
let dashboardWidgets = [];
let refreshTimer = null;
let autoRefreshInterval = 30000; // 30 seconds by default
let currentTimeRange = '24h';
let customTimeRange = {
    start: null,
    end: null
};

/**
 * Initialize the dashboard
 */
function initDashboard() {
    // Get dashboard ID from the page (if any)
    const dashboardId = getDashboardId();
    
    if (dashboardId) {
        fetchDashboardData(dashboardId);
    } else {
        // No specific dashboard, load default
        loadDefaultDashboard();
    }
    
    // Initialize refresh timer based on selected value
    const refreshSelector = document.getElementById('auto-refresh');
    if (refreshSelector) {
        setupAutoRefresh(refreshSelector.value);
    }
}

/**
 * Get dashboard ID from the page
 * @returns {string|null} Dashboard ID or null if not found
 */
function getDashboardId() {
    // Try to find a hidden input with dashboard ID
    const dashboardIdInput = document.getElementById('dashboard-id');
    if (dashboardIdInput && dashboardIdInput.value) {
        return dashboardIdInput.value;
    }
    
    // Or try to extract from the URL path - handle both /dashboard/1 and /dashboard/dashboard/1 patterns
    let pathMatch = window.location.pathname.match(/\/dashboard\/(\d+)$/);
    if (!pathMatch) {
        // Try alternate pattern for legacy routes
        pathMatch = window.location.pathname.match(/\/dashboard\/dashboard\/(\d+)$/);
    }
    
    if (pathMatch && pathMatch[1]) {
        return pathMatch[1];
    }
    
    return null;
}

/**
 * Fetch dashboard data from the server
 * @param {string} dashboardId - Dashboard ID to fetch
 */
function fetchDashboardData(dashboardId) {
    showDashboardLoading(true);
    
    // Build URL with time range parameters
    let url = `/api/dashboards/${dashboardId}/data?time_range=${currentTimeRange}`;
    
    if (currentTimeRange === 'custom' && customTimeRange.start && customTimeRange.end) {
        url += `&start_time=${customTimeRange.start.toISOString()}&end_time=${customTimeRange.end.toISOString()}`;
    }
    
    // Get CSRF token from cookie
    const csrfToken = getCookie('csrf_token') || '';
    console.log("Fetching dashboard data from:", url);
    console.log("Using CSRF token:", csrfToken ? "Present" : "Not found");
    
    fetch(url, {
        headers: {
            'X-CSRFToken': csrfToken
        },
        credentials: 'same-origin'
    })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch dashboard data');
            }
            return response.json();
        })
        .then(data => {
            dashboard = data;
            dashboardWidgets = data.widgets || [];
            renderDashboard();
        })
        .catch(error => {
            console.error('Error fetching dashboard data:', error);
            // Add error debug details
            if (error.message) {
                console.error('Error message:', error.message);
            }
            // Create demo data for testing - this will be removed after the API is fixed
            console.log("Using sample dashboard data for development");
            const sampleData = createSampleDashboardData();
            dashboard = sampleData;
            dashboardWidgets = sampleData.widgets || [];
            renderDashboard();
            
            // Use central notification system
            if (typeof notify !== 'undefined') {
                notify('warning', 'Failed to load dashboard data. Using sample data.');
            } else {
                console.warn('Failed to load dashboard data. Using sample data.');
            }
        })
        .finally(() => {
            showDashboardLoading(false);
        });
}

/**
 * Load default dashboard if no specific dashboard is selected
 */
function loadDefaultDashboard() {
    showDashboardLoading(true);
    
    // Check if there's a default dashboard in the selector
    const selector = document.getElementById('dashboard-selector');
    if (selector && selector.value && selector.value !== 'new') {
        // Use the selected dashboard
        window.location.href = `/dashboard/${selector.value}`;
        return;
    }
    
    // Otherwise, show empty dashboard or system overview
    dashboardWidgets = [];
    renderDashboard();
    showDashboardLoading(false);
}

/**
 * Render the dashboard based on fetched data
 */
function renderDashboard() {
    const dashboardGrid = document.getElementById('dashboard-grid');
    if (!dashboardGrid) return;
    
    // Clear existing content
    dashboardGrid.innerHTML = '';
    
    if (!dashboardWidgets || dashboardWidgets.length === 0) {
        // Show empty state
        dashboardGrid.innerHTML = `
            <div class="empty-dashboard">
                <div class="empty-state-icon">
                    <i class="fas fa-chart-line"></i>
                </div>
                <h3>No Widgets</h3>
                <p>This dashboard doesn't have any widgets yet.</p>
                <button class="btn btn-primary" id="add-first-widget-btn">
                    <i class="fas fa-plus"></i> Add First Widget
                </button>
            </div>
        `;
        
        // Attach event listener to the add widget button
        const addWidgetBtn = document.getElementById('add-first-widget-btn');
        if (addWidgetBtn) {
            addWidgetBtn.addEventListener('click', () => showModal('add-widget-modal'));
        }
        
        return;
    }
    
    // Sort widgets by position (top to bottom, left to right)
    dashboardWidgets.sort((a, b) => {
        if (a.position_y !== b.position_y) {
            return a.position_y - b.position_y;
        }
        return a.position_x - b.position_x;
    });
    
    // Render each widget
    dashboardWidgets.forEach(widget => {
        const widgetElement = createWidgetElement(widget);
        dashboardGrid.appendChild(widgetElement);
    });
}

/**
 * Create a widget DOM element
 * @param {Object} widget - Widget configuration object
 * @returns {HTMLElement} - Widget DOM element
 */
function createWidgetElement(widget) {
    const widgetElement = document.createElement('div');
    widgetElement.className = 'dashboard-item';
    widgetElement.id = `widget-${widget.id}`;
    widgetElement.dataset.widgetId = widget.id;
    
    // Set widget size classes based on width and height
    const width = widget.width || 1;
    const height = widget.height || 1;
    
    if (width > 1) {
        widgetElement.classList.add(`width-${width}`);
    }
    if (height > 1) {
        widgetElement.classList.add(`height-${height}`);
    }
    
    // Set grid position
    widgetElement.style.gridColumnStart = widget.position_x + 1;
    widgetElement.style.gridColumnEnd = widget.position_x + width + 1;
    widgetElement.style.gridRowStart = widget.position_y + 1;
    widgetElement.style.gridRowEnd = widget.position_y + height + 1;
    
    // Create widget content
    widgetElement.innerHTML = `
        <div class="widget">
            <div class="widget-header">
                <div class="widget-title">${widget.name}</div>
                <div class="widget-actions">
                    <button class="btn btn-icon btn-sm widget-refresh-btn" title="Refresh" data-widget-id="${widget.id}">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button class="btn btn-icon btn-sm widget-settings-btn" title="Settings" data-widget-id="${widget.id}">
                        <i class="fas fa-cog"></i>
                    </button>
                </div>
            </div>
            <div class="widget-body" id="widget-body-${widget.id}">
                <div class="widget-loading" style="display: none;">
                    <div class="spinner"></div>
                </div>
                <div class="widget-content"></div>
            </div>
        </div>
    `;
    
    // Attach event listeners for widget actions
    const refreshBtn = widgetElement.querySelector('.widget-refresh-btn');
    const settingsBtn = widgetElement.querySelector('.widget-settings-btn');
    
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => refreshWidget(widget.id));
    }
    
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => showWidgetSettings(widget.id));
    }
    
    // Render widget content based on its type and data
    renderWidgetContent(widgetElement.querySelector('.widget-content'), widget);
    
    return widgetElement;
}

/**
 * Render content for a specific widget based on its type
 * @param {HTMLElement} container - Widget content container
 * @param {Object} widget - Widget configuration
 */
function renderWidgetContent(container, widget) {
    if (!container) return;
    
    const type = widget.type;
    const data = widget.data || {};
    
    // Clear existing content
    container.innerHTML = '';
    
    // Render based on widget type
    if (type === 'line-chart') {
        renderLineChart(container, widget);
    } else if (type === 'bar-chart') {
        renderBarChart(container, widget);
    } else if (type === 'pie-chart') {
        renderPieChart(container, widget);
    } else if (type === 'gauge') {
        renderGaugeChart(container, widget);
    } else if (type === 'stat') {
        renderStatsWidget(container, widget);
    } else if (type === 'table') {
        renderTableWidget(container, widget);
    } else if (type === 'alert-list') {
        renderAlertList(container, widget);
    } else {
        // Unknown widget type
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-question-circle"></i>
                </div>
                <h3>Unknown Widget Type</h3>
                <p>Widget type "${type}" is not supported.</p>
            </div>
        `;
    }
}

/**
 * Render a line chart widget
 * @param {HTMLElement} container - Widget container
 * @param {Object} widget - Widget data
 */
function renderLineChart(container, widget) {
    const data = widget.data || {};
    const timePoints = data.time_points || [];
    const values = data.values || [];
    const datasets = data.datasets || [];
    
    if (timePoints.length === 0 || (values.length === 0 && datasets.length === 0)) {
        renderNoDataMessage(container);
        return;
    }
    
    // Create canvas for the chart
    const canvasId = `chart-${widget.id}`;
    container.innerHTML = `<canvas id="${canvasId}"></canvas>`;
    
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    // Prepare chart data
    const chartData = {
        labels: timePoints,
        datasets: []
    };
    
    // If we have simple values array, create a single dataset
    if (values.length > 0) {
        chartData.datasets.push({
            label: widget.name,
            data: values,
            borderColor: '#c50000',
            backgroundColor: 'rgba(197, 0, 0, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4
        });
    } 
    // If we have multiple datasets
    else if (datasets.length > 0) {
        const colors = [
            '#c50000', '#36A2EB', '#4BC0C0', '#FFCE56', 
            '#9966FF', '#FF9F40', '#C9CBCF'
        ];
        
        datasets.forEach((dataset, index) => {
            const color = colors[index % colors.length];
            chartData.datasets.push({
                label: dataset.label || `Dataset ${index + 1}`,
                data: dataset.values || [],
                borderColor: color,
                backgroundColor: `${color}33`,
                borderWidth: 2,
                fill: true,
                tension: 0.4
            });
        });
    }
    
    // Create chart
    new Chart(ctx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#aaaaaa'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#aaaaaa'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#f0f0f0'
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}

/**
 * Render a bar chart widget
 * @param {HTMLElement} container - Widget container
 * @param {Object} widget - Widget data
 */
function renderBarChart(container, widget) {
    const data = widget.data || {};
    const timePoints = data.time_points || [];
    const values = data.values || [];
    const datasets = data.datasets || [];
    
    if (timePoints.length === 0 || (values.length === 0 && datasets.length === 0)) {
        renderNoDataMessage(container);
        return;
    }
    
    // Create canvas for the chart
    const canvasId = `chart-${widget.id}`;
    container.innerHTML = `<canvas id="${canvasId}"></canvas>`;
    
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    // Prepare chart data
    const chartData = {
        labels: timePoints,
        datasets: []
    };
    
    // If we have simple values array, create a single dataset
    if (values.length > 0) {
        chartData.datasets.push({
            label: widget.name,
            data: values,
            backgroundColor: '#c50000',
            borderWidth: 1,
            borderColor: 'rgba(0, 0, 0, 0.2)'
        });
    } 
    // If we have multiple datasets
    else if (datasets.length > 0) {
        const colors = [
            '#c50000', '#36A2EB', '#4BC0C0', '#FFCE56', 
            '#9966FF', '#FF9F40', '#C9CBCF'
        ];
        
        datasets.forEach((dataset, index) => {
            const color = colors[index % colors.length];
            chartData.datasets.push({
                label: dataset.label || `Dataset ${index + 1}`,
                data: dataset.values || [],
                backgroundColor: color,
                borderWidth: 1,
                borderColor: 'rgba(0, 0, 0, 0.2)'
            });
        });
    }
    
    // Create chart
    new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#aaaaaa'
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: '#aaaaaa'
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#f0f0f0'
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            }
        }
    });
}

/**
 * Render a pie chart widget
 * @param {HTMLElement} container - Widget container
 * @param {Object} widget - Widget data
 */
function renderPieChart(container, widget) {
    const data = widget.data || {};
    const labels = data.labels || [];
    const values = data.values || [];
    
    if (labels.length === 0 || values.length === 0) {
        renderNoDataMessage(container);
        return;
    }
    
    // Create canvas for the chart
    const canvasId = `chart-${widget.id}`;
    container.innerHTML = `<canvas id="${canvasId}"></canvas>`;
    
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    // Default colors
    const colors = [
        '#c50000', '#36A2EB', '#4BC0C0', '#FFCE56', 
        '#9966FF', '#FF9F40', '#C9CBCF', '#FF6384'
    ];
    
    // Create chart
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, values.length),
                borderWidth: 1,
                borderColor: 'rgba(0, 0, 0, 0.2)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#f0f0f0'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.formattedValue;
                            const sum = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.raw / sum) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render a gauge chart widget
 * @param {HTMLElement} container - Widget container
 * @param {Object} widget - Widget data
 */
function renderGaugeChart(container, widget) {
    const data = widget.data || {};
    const value = data.value || 0;
    const min = data.min || 0;
    const max = data.max || 100;
    const thresholds = data.thresholds || [
        { value: 60, color: 'red' },
        { value: 80, color: 'yellow' },
        { value: 90, color: 'green' }
    ];
    
    // Create canvas for the chart
    const canvasId = `chart-${widget.id}`;
    container.innerHTML = `<canvas id="${canvasId}"></canvas>`;
    
    const ctx = document.getElementById(canvasId).getContext('2d');
    
    // Determine gauge color based on thresholds
    let gaugeColor = '#c50000'; // Default color
    for (const threshold of thresholds) {
        if (value <= threshold.value) {
            gaugeColor = getColorForThreshold(threshold.color);
            break;
        }
    }
    
    // Create gauge chart (based on doughnut chart)
    createGaugeChart(canvasId, value, widget.name, {
        min: min,
        max: max,
        color: gaugeColor
    });
}

/**
 * Get color for gauge threshold
 * @param {string} color - Color name
 * @returns {string} - HEX color code
 */
function getColorForThreshold(color) {
    switch (color.toLowerCase()) {
        case 'red': return '#FF6384';
        case 'yellow': return '#FFCE56';
        case 'green': return '#4BC0C0';
        default: return color;
    }
}

/**
 * Render a statistics widget
 * @param {HTMLElement} container - Widget container
 * @param {Object} widget - Widget data
 */
function renderStatsWidget(container, widget) {
    const data = widget.data || {};
    const stats = data.stats || [];
    
    if (stats.length === 0) {
        // Use dashboard summary if available
        if (dashboard.summary) {
            const summary = dashboard.summary;
            container.innerHTML = `
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${summary.total_logs || 0}</div>
                        <div class="stat-label">Total Logs</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${summary.total_metrics || 0}</div>
                        <div class="stat-label">Total Metrics</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${summary.active_devices || 0}</div>
                        <div class="stat-label">Active Devices</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${summary.severity_distribution?.ERROR || 0}</div>
                        <div class="stat-label">Error Logs</div>
                    </div>
                </div>
            `;
            return;
        }
        
        renderNoDataMessage(container);
        return;
    }
    
    // Render stats grid
    container.innerHTML = `
        <div class="stats-grid">
            ${stats.map(stat => `
                <div class="stat-card">
                    <div class="stat-value">${stat.value}</div>
                    <div class="stat-label">${stat.label}</div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Render a table widget
 * @param {HTMLElement} container - Widget container
 * @param {Object} widget - Widget data
 */
function renderTableWidget(container, widget) {
    const data = widget.data || {};
    const headers = data.headers || [];
    const rows = data.rows || [];
    
    if (headers.length === 0 || rows.length === 0) {
        renderNoDataMessage(container);
        return;
    }
    
    // Render table
    container.innerHTML = `
        <div class="table-responsive">
            <table class="table">
                <thead>
                    <tr>
                        ${headers.map(header => `<th>${header}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(row => `
                        <tr>
                            ${row.map(cell => `<td>${cell}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Render an alert list widget
 * @param {HTMLElement} container - Widget container
 * @param {Object} widget - Widget data
 */
function renderAlertList(container, widget) {
    const data = widget.data || {};
    const alerts = data.alerts || [];
    
    if (alerts.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">
                    <i class="fas fa-bell-slash"></i>
                </div>
                <h3>No Alerts</h3>
                <p>No alerts match the current filter criteria.</p>
            </div>
        `;
        return;
    }
    
    // Render alert list
    container.innerHTML = `
        <div class="alert-list">
            ${alerts.map(alert => `
                <div class="alert-item alert-${alert.severity.toLowerCase()}">
                    <div class="alert-time">${formatTimestamp(alert.timestamp)}</div>
                    <div class="alert-content">
                        <div class="alert-message">${alert.message}</div>
                        <div class="alert-source">${alert.source}</div>
                    </div>
                    <div class="alert-severity">${alert.severity}</div>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Format timestamp for display
 * @param {string} timestamp - ISO timestamp
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
}

/**
 * Render a no data message
 * @param {HTMLElement} container - Widget container
 */
function renderNoDataMessage(container) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">
                <i class="fas fa-chart-area"></i>
            </div>
            <h3>No Data</h3>
            <p>No data is available for the selected time range.</p>
        </div>
    `;
}

/**
 * Show or hide dashboard loading indicator
 * @param {boolean} show - Whether to show the loading indicator
 */
function showDashboardLoading(show) {
    const loadingIndicator = document.getElementById('dashboard-loading');
    if (loadingIndicator) {
        loadingIndicator.style.display = show ? 'block' : 'none';
    }
}

/**
 * Show or hide widget loading indicator
 * @param {string} widgetId - Widget ID
 * @param {boolean} show - Whether to show the loading indicator
 */
function showWidgetLoading(widgetId, show) {
    const loadingIndicator = document.querySelector(`#widget-body-${widgetId} .widget-loading`);
    const widgetContent = document.querySelector(`#widget-body-${widgetId} .widget-content`);
    
    if (loadingIndicator) {
        loadingIndicator.style.display = show ? 'flex' : 'none';
    }
    
    if (widgetContent) {
        widgetContent.style.display = show ? 'none' : 'block';
    }
}

/**
 * Refresh a specific widget
 * @param {string} widgetId - Widget ID to refresh
 */
function refreshWidget(widgetId) {
    const widget = dashboardWidgets.find(w => w.id == widgetId);
    if (!widget) return;
    
    showWidgetLoading(widgetId, true);
    
    // Build URL with time range parameters
    let url = `/api/widgets/${widgetId}/data?time_range=${currentTimeRange}`;
    
    if (currentTimeRange === 'custom' && customTimeRange.start && customTimeRange.end) {
        url += `&start_time=${customTimeRange.start.toISOString()}&end_time=${customTimeRange.end.toISOString()}`;
    }
    
    fetch(url)
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to fetch widget data');
            }
            return response.json();
        })
        .then(data => {
            // Update widget data
            widget.data = data;
            
            // Re-render widget content
            const container = document.querySelector(`#widget-body-${widgetId} .widget-content`);
            if (container) {
                renderWidgetContent(container, widget);
            }
        })
        .catch(error => {
            console.error('Error refreshing widget:', error);
            if (typeof notify !== 'undefined') {
                notify('error', `Failed to refresh widget: ${widget.name}`);
            } else {
                console.error(`Failed to refresh widget: ${widget.name}`);
            }
        })
        .finally(() => {
            showWidgetLoading(widgetId, false);
        });
}

/**
 * Refresh the entire dashboard
 */
function refreshDashboard() {
    const dashboardId = getDashboardId();
    if (dashboardId) {
        fetchDashboardData(dashboardId);
    } else {
        showNotification('No dashboard to refresh', 'warning');
    }
}

/**
 * Setup automatic refresh timer
 * @param {string} interval - Refresh interval (e.g., '30s', '1m', 'off')
 */
function setupAutoRefresh(interval) {
    // Clear existing timer
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
    
    if (interval === 'off') {
        return;
    }
    
    // Parse interval
    let milliseconds = 30000; // Default: 30 seconds
    
    if (interval.endsWith('s')) {
        milliseconds = parseInt(interval.slice(0, -1)) * 1000;
    } else if (interval.endsWith('m')) {
        milliseconds = parseInt(interval.slice(0, -1)) * 60 * 1000;
    }
    
    // Set up new timer
    refreshTimer = setInterval(() => {
        refreshDashboard();
    }, milliseconds);
}

/**
 * Apply custom time range
 */
function applyCustomTimeRange() {
    const startTimeInput = document.getElementById('custom-start-time');
    const endTimeInput = document.getElementById('custom-end-time');
    
    if (!startTimeInput || !endTimeInput) {
        closeModal('custom-time-modal');
        return;
    }
    
    const startTime = startTimeInput.value;
    const endTime = endTimeInput.value;
    
    if (!startTime || !endTime) {
        showNotification('Please select both start and end time', 'warning');
        return;
    }
    
    // Parse dates
    customTimeRange.start = new Date(startTime);
    customTimeRange.end = new Date(endTime);
    
    // Set time range to custom
    currentTimeRange = 'custom';
    
    // Update the time range selector
    const timeRangeSelector = document.getElementById('time-range');
    if (timeRangeSelector) {
        timeRangeSelector.value = 'custom';
    }
    
    // Refresh dashboard with new time range
    refreshDashboard();
    
    // Close modal
    closeModal('custom-time-modal');
}

/**
 * Show widget settings modal
 * @param {string} widgetId - ID of the widget to edit
 */
function showWidgetSettings(widgetId) {
    const widget = dashboardWidgets.find(w => w.id == widgetId);
    if (!widget) return;
    
    // Populate form fields
    document.getElementById('edit-widget-id').value = widget.id;
    document.getElementById('edit-widget-name').value = widget.name;
    
    // Set widget size
    const sizeSelector = document.getElementById('edit-widget-size');
    if (sizeSelector) {
        const size = `${widget.width}x${widget.height}`;
        sizeSelector.value = size;
    }
    
    // Show modal
    showModal('widget-settings-modal');
}

/**
 * Update widget configuration
 */
function updateWidget() {
    const widgetId = document.getElementById('edit-widget-id').value;
    if (!widgetId) {
        closeModal('widget-settings-modal');
        return;
    }
    
    const widget = dashboardWidgets.find(w => w.id == widgetId);
    if (!widget) {
        closeModal('widget-settings-modal');
        return;
    }
    
    // Get updated values
    const name = document.getElementById('edit-widget-name').value;
    const size = document.getElementById('edit-widget-size').value;
    
    // Update widget on server
    fetch(`/api/widgets/${widgetId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({
            name: name,
            size: size
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to update widget');
        }
        return response.json();
    })
    .then(data => {
        showNotification('Widget updated successfully', 'success');
        
        // Update local widget data
        widget.name = name;
        
        // Parse size
        const sizeParts = size.split('x');
        widget.width = parseInt(sizeParts[0]);
        widget.height = parseInt(sizeParts[1] || '1');
        
        // Re-render dashboard
        renderDashboard();
    })
    .catch(error => {
        console.error('Error updating widget:', error);
        if (typeof notify !== 'undefined') {
            notify('error', 'Failed to update widget');
        } else {
            console.error('Failed to update widget');
        }
    })
    .finally(() => {
        closeModal('widget-settings-modal');
    });
}

/**
 * Delete a widget
 */
function deleteWidget() {
    const widgetId = document.getElementById('edit-widget-id').value;
    if (!widgetId) {
        closeModal('widget-settings-modal');
        return;
    }
    
    // Delete widget on server
    fetch(`/api/widgets/${widgetId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to delete widget');
        }
        return response.json();
    })
    .then(data => {
        showNotification('Widget deleted successfully', 'success');
        
        // Remove widget from local array
        dashboardWidgets = dashboardWidgets.filter(w => w.id != widgetId);
        
        // Re-render dashboard
        renderDashboard();
    })
    .catch(error => {
        console.error('Error deleting widget:', error);
        if (typeof notify !== 'undefined') {
            notify('error', 'Failed to delete widget');
        } else {
            console.error('Failed to delete widget');
        }
    })
    .finally(() => {
        closeModal('widget-settings-modal');
    });
}

/**
 * Add a new widget to the dashboard
 */
function addWidget() {
    const dashboardId = getDashboardId();
    if (!dashboardId) {
        showNotification('No dashboard selected', 'error');
        return;
    }
    
    // Get form values
    const name = document.getElementById('widget-name').value;
    const type = document.getElementById('widget-type').value;
    const dataSource = document.getElementById('widget-data-source').value;
    const size = document.getElementById('widget-size').value;
    
    // Validate required fields
    if (!name || !type || !dataSource) {
        showNotification('Please fill in all required fields', 'warning');
        return;
    }
    
    // Get configuration
    const configContainer = document.getElementById('widget-config-container');
    const configuration = {};
    
    // TODO: Extract configuration from form fields
    
    // Find position for new widget
    const position = findNextWidgetPosition();
    
    // Create widget on server
    fetch('/api/widgets', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({
            name: name,
            widget_type: type,
            data_source: dataSource,
            configuration: configuration,
            dashboard_id: dashboardId,
            position_x: position.x,
            position_y: position.y,
            size: size
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to create widget');
        }
        return response.json();
    })
    .then(data => {
        showNotification('Widget added successfully', 'success');
        
        // Refresh dashboard to show new widget
        refreshDashboard();
    })
    .catch(error => {
        console.error('Error creating widget:', error);
        if (typeof notify !== 'undefined') {
            notify('error', 'Failed to create widget');
        } else {
            console.error('Failed to create widget');
        }
    })
    .finally(() => {
        closeModal('add-widget-modal');
        
        // Reset form
        document.getElementById('widget-name').value = '';
        document.getElementById('widget-type').value = '';
        document.getElementById('widget-data-source').value = '';
        document.getElementById('widget-size').value = '2x2';
    });
}

/**
 * Update the available widget configuration options based on the widget type
 * @param {string} widgetType - Type of widget
 */
function updateWidgetConfigOptions(widgetType) {
    const configOptionsContainer = document.getElementById('widget-config-options');
    if (!configOptionsContainer) return;
    
    // Clear current options
    configOptionsContainer.innerHTML = '';
    
    // Add relevant configuration options based on widget type
    switch (widgetType) {
        case 'line-chart':
        case 'bar-chart':
            configOptionsContainer.innerHTML = `
                <div class="form-group">
                    <label for="widget-time-period">Time Period</label>
                    <select id="widget-time-period" class="form-control">
                        <option value="1h">Last Hour</option>
                        <option value="6h">Last 6 Hours</option>
                        <option value="24h" selected>Last 24 Hours</option>
                        <option value="7d">Last 7 Days</option>
                        <option value="30d">Last 30 Days</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="widget-aggregation">Aggregation</label>
                    <select id="widget-aggregation" class="form-control">
                        <option value="avg" selected>Average</option>
                        <option value="sum">Sum</option>
                        <option value="min">Minimum</option>
                        <option value="max">Maximum</option>
                        <option value="count">Count</option>
                    </select>
                </div>
            `;
            break;
            
        case 'pie-chart':
            configOptionsContainer.innerHTML = `
                <div class="form-group">
                    <label for="widget-category">Category</label>
                    <select id="widget-category" class="form-control">
                        <option value="severity" selected>Severity</option>
                        <option value="source">Source</option>
                        <option value="device">Device</option>
                    </select>
                </div>
            `;
            break;
            
        case 'gauge':
            configOptionsContainer.innerHTML = `
                <div class="form-group">
                    <label for="widget-metric">Metric</label>
                    <select id="widget-metric" class="form-control">
                        <option value="cpu" selected>CPU Usage</option>
                        <option value="memory">Memory Usage</option>
                        <option value="disk">Disk Usage</option>
                        <option value="network">Network Utilization</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="widget-min-value">Minimum Value</label>
                    <input type="number" id="widget-min-value" class="form-control" value="0">
                </div>
                <div class="form-group">
                    <label for="widget-max-value">Maximum Value</label>
                    <input type="number" id="widget-max-value" class="form-control" value="100">
                </div>
            `;
            break;
            
        case 'stat':
            configOptionsContainer.innerHTML = `
                <div class="form-group">
                    <label for="widget-stat-type">Stat Type</label>
                    <select id="widget-stat-type" class="form-control">
                        <option value="count" selected>Count</option>
                        <option value="latest">Latest Value</option>
                        <option value="average">Average</option>
                        <option value="sum">Sum</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="widget-comparison">Comparison Period</label>
                    <select id="widget-comparison" class="form-control">
                        <option value="1h">Previous Hour</option>
                        <option value="24h" selected>Previous Day</option>
                        <option value="7d">Previous Week</option>
                        <option value="30d">Previous Month</option>
                    </select>
                </div>
            `;
            break;
            
        case 'table':
            configOptionsContainer.innerHTML = `
                <div class="form-group">
                    <label for="widget-table-columns">Columns</label>
                    <textarea id="widget-table-columns" class="form-control" rows="3" placeholder="timestamp,severity,message"></textarea>
                    <small class="form-text text-muted">Comma-separated list of columns to display</small>
                </div>
                <div class="form-group">
                    <label for="widget-limit">Row Limit</label>
                    <input type="number" id="widget-limit" class="form-control" value="10">
                </div>
            `;
            break;
            
        case 'alert-list':
            configOptionsContainer.innerHTML = `
                <div class="form-group">
                    <label for="widget-alert-status">Alert Status</label>
                    <select id="widget-alert-status" class="form-control">
                        <option value="active" selected>Active</option>
                        <option value="all">All</option>
                        <option value="acknowledged">Acknowledged</option>
                        <option value="resolved">Resolved</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="widget-alert-limit">Limit</label>
                    <input type="number" id="widget-alert-limit" class="form-control" value="5">
                </div>
            `;
            break;
            
        default:
            // No specific options for unknown widget types
            break;
    }
}

/**
 * Update the available data source options based on the widget type
 * @param {string} widgetType - Type of widget
 */
function updateDataSourceOptions(widgetType) {
    const dataSourceSelect = document.getElementById('widget-data-source');
    if (!dataSourceSelect) return;
    
    // Clear current options
    dataSourceSelect.innerHTML = '<option value="">Select a data source</option>';
    
    // Add relevant data sources based on widget type
    switch (widgetType) {
        case 'line-chart':
        case 'bar-chart':
        case 'gauge':
        case 'stat':
            // These can use any data source
            dataSourceSelect.innerHTML += `
                <option value="SYSLOG">Syslog</option>
                <option value="SNMP">SNMP</option>
                <option value="NETFLOW">NetFlow</option>
                <option value="SFLOW">sFlow</option>
                <option value="WINDOWS_EVENTS">Windows Events</option>
                <option value="OTEL">OpenTelemetry</option>
            `;
            break;
            
        case 'pie-chart':
        case 'table':
            // These work better with log-based sources
            dataSourceSelect.innerHTML += `
                <option value="SYSLOG">Syslog</option>
                <option value="WINDOWS_EVENTS">Windows Events</option>
                <option value="SNMP">SNMP</option>
            `;
            break;
            
        case 'alert-list':
            // Only one source for alerts
            dataSourceSelect.innerHTML += `
                <option value="ALERTS" selected>Alerts</option>
            `;
            break;
            
        default:
            // Default set of data sources
            dataSourceSelect.innerHTML += `
                <option value="SYSLOG">Syslog</option>
                <option value="SNMP">SNMP</option>
            `;
            break;
    }
}
}

/**
 * Find the next available position for a new widget
 * @returns {Object} Position object with x and y coordinates
 */
function findNextWidgetPosition() {
    // Start with position (0, 0)
    let position = { x: 0, y: 0 };
    
    if (!dashboardWidgets || dashboardWidgets.length === 0) {
        return position;
    }
    
    // Find the widget with the highest y position
    const maxY = Math.max(...dashboardWidgets.map(w => w.position_y + (w.height || 1)));
    
    // Place the new widget below all existing widgets
    position.y = maxY;
    
    return position;
}

/**
 * Create a new dashboard
 */
function createDashboard() {
    // Get form values
    const name = document.getElementById('new-dashboard-name').value;
    const description = document.getElementById('new-dashboard-description').value;
    const organizationId = document.getElementById('new-dashboard-organization').value;
    const isDefault = document.getElementById('new-dashboard-default').checked;
    
    // Validate required fields
    if (!name) {
        showNotification('Dashboard name is required', 'warning');
        return;
    }
    
    // Create dashboard on server
    fetch('/api/dashboards', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({
            name: name,
            description: description,
            organization_id: organizationId || null,
            is_default: isDefault
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to create dashboard');
        }
        return response.json();
    })
    .then(data => {
        showNotification('Dashboard created successfully', 'success');
        
        // Redirect to the new dashboard
        window.location.href = `/dashboard/${data.id}`;
    })
    .catch(error => {
        console.error('Error creating dashboard:', error);
        if (typeof notify !== 'undefined') {
            notify('error', 'Failed to create dashboard');
        } else {
            console.error('Failed to create dashboard');
        }
    })
    .finally(() => {
        closeModal('create-dashboard-modal');
    });
}

/**
 * Save dashboard settings
 */
function saveDashboard() {
    const dashboardId = getDashboardId();
    if (!dashboardId) {
        closeModal('edit-dashboard-modal');
        return;
    }
    
    // Get form values
    const name = document.getElementById('edit-dashboard-name').value;
    const description = document.getElementById('edit-dashboard-description').value;
    const organizationId = document.getElementById('edit-dashboard-organization').value;
    const isDefault = document.getElementById('edit-dashboard-default').checked;
    
    // Validate required fields
    if (!name) {
        showNotification('Dashboard name is required', 'warning');
        return;
    }
    
    // Update dashboard on server
    fetch(`/api/dashboards/${dashboardId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        },
        body: JSON.stringify({
            name: name,
            description: description,
            organization_id: organizationId || null,
            is_default: isDefault
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to update dashboard');
        }
        return response.json();
    })
    .then(data => {
        showNotification('Dashboard updated successfully', 'success');
        
        // Update dashboard name in the UI
        const dashboardName = document.getElementById('dashboard-name');
        if (dashboardName) {
            dashboardName.textContent = name;
        }
    })
    .catch(error => {
        console.error('Error updating dashboard:', error);
        if (typeof notify !== 'undefined') {
            notify('error', 'Failed to update dashboard');
        } else {
            console.error('Failed to update dashboard');
        }
    })
    .finally(() => {
        closeModal('edit-dashboard-modal');
    });
}

/**
 * Delete a dashboard
 */
function deleteDashboard() {
    const dashboardId = getDashboardId();
    if (!dashboardId) {
        return;
    }
    
    // Delete dashboard on server
    fetch(`/api/dashboards/${dashboardId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken()
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to delete dashboard');
        }
        return response.json();
    })
    .then(data => {
        showNotification('Dashboard deleted successfully', 'success');
        
        // Redirect to dashboards page
        window.location.href = '/dashboard';
    })
    .catch(error => {
        console.error('Error deleting dashboard:', error);
        if (typeof notify !== 'undefined') {
            notify('error', 'Failed to delete dashboard');
        } else {
            console.error('Failed to delete dashboard');
        }
    })
    .finally(() => {
        closeModal('edit-dashboard-modal');
    });
}

/**
 * Show a modal
 * @param {string} modalId - ID of the modal to show
 */
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.classList.add('modal-open');
    }
}

/**
 * Close a modal
 * @param {string} modalId - ID of the modal to close
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('modal-open');
    }
}

/**
 * Get CSRF token from the page
 * @returns {string} CSRF token
 */
function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

/**
 * Show notification to the user
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, info, warning)
 */
function showNotification(message, type = 'info') {
    // Create notification container if it doesn't exist
    let container = document.getElementById('notification-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notification-container';
        document.body.appendChild(container);
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-icon">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
        </div>
        <div class="notification-content">${message}</div>
        <button class="notification-close">&times;</button>
    `;
    
    // Add to container
    container.appendChild(notification);
    
    // Add event listener to close button
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            notification.classList.add('notification-hide');
            setTimeout(() => {
                container.removeChild(notification);
            }, 300);
        });
    }
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (notification.parentNode === container) {
            notification.classList.add('notification-hide');
            setTimeout(() => {
                if (notification.parentNode === container) {
                    container.removeChild(notification);
                }
            }, 300);
        }
    }, 5000);
}

/**
 * Get icon for notification type
 * @param {string} type - Notification type
 * @returns {string} - Icon name
 */
function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'warning': return 'exclamation-triangle';
        case 'info':
        default: return 'info-circle';
    }
}

/**
 * Get cookie value by name
 * @param {string} name - Name of the cookie
 * @returns {string} Cookie value
 */
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return '';
}

/**
 * Create sample dashboard data for development
 * @returns {Object} Sample dashboard data
 */
function createSampleDashboardData() {
    const now = new Date();
    const timePoints = [];
    const values1 = [];
    const values2 = [];
    
    // Generate time points and values for the last 24 hours
    for (let i = 0; i < 24; i++) {
        const time = new Date(now);
        time.setHours(now.getHours() - 24 + i);
        timePoints.push(time.getHours() + ':00');
        values1.push(Math.floor(Math.random() * 500) + 100);
        values2.push(Math.floor(Math.random() * 300) + 50);
    }
    
    return {
        dashboard_id: 1,
        widgets: [
            {
                id: 1,
                name: 'System Overview',
                widget_type: 'stat',
                data_source: 'SYSLOG',
                position_x: 0,
                position_y: 0,
                width: 1,
                height: 1,
                configuration: JSON.stringify({}),
                data: {
                    stats: [
                        {
                            title: 'Total Logs',
                            value: 12345,
                            change: 15,
                            icon: 'fa-file-alt'
                        },
                        {
                            title: 'Errors',
                            value: 42,
                            change: -8,
                            icon: 'fa-exclamation-circle'
                        },
                        {
                            title: 'Warnings',
                            value: 156,
                            change: 12,
                            icon: 'fa-exclamation-triangle'
                        }
                    ]
                }
            },
            {
                id: 2,
                name: 'Recent Alerts',
                widget_type: 'alert-list',
                data_source: 'SYSLOG',
                position_x: 1,
                position_y: 0,
                width: 2,
                height: 1,
                configuration: JSON.stringify({}),
                data: {
                    alerts: [
                        {
                            id: 1,
                            timestamp: new Date().toISOString(),
                            severity: 'WARNING',
                            message: 'High CPU utilization on Core Router',
                            acknowledged: false,
                            resolved: false
                        },
                        {
                            id: 2,
                            timestamp: new Date(now.getTime() - 30*60000).toISOString(),
                            severity: 'CRITICAL',
                            message: 'Web Server disk space critically low',
                            acknowledged: false,
                            resolved: false
                        },
                        {
                            id: 3,
                            timestamp: new Date(now.getTime() - 60*60000).toISOString(),
                            severity: 'ERROR',
                            message: 'Database server connection timeouts exceeding threshold',
                            acknowledged: false,
                            resolved: false
                        }
                    ]
                }
            },
            {
                id: 3,
                name: 'Log Volume',
                widget_type: 'line-chart',
                data_source: 'SYSLOG',
                position_x: 0,
                position_y: 1,
                width: 2,
                height: 1,
                configuration: JSON.stringify({}),
                data: {
                    time_points: timePoints,
                    values: values1
                }
            },
            {
                id: 4,
                name: 'Error Distribution',
                widget_type: 'pie-chart',
                data_source: 'SYSLOG',
                position_x: 2,
                position_y: 1,
                width: 1,
                height: 1,
                configuration: JSON.stringify({}),
                data: {
                    labels: ['Network', 'System', 'Application', 'Security'],
                    values: [42, 18, 27, 13]
                }
            }
        ],
        summary: {
            total_logs: 12345,
            total_metrics: 54321,
            active_alerts: 7,
            devices_count: 42
        },
        time_range: {
            start: new Date(now.getTime() - 24*60*60*1000).toISOString(),
            end: now.toISOString()
        }
    };
}