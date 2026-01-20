// Logging prefix for easy filtering
const LOG_PREFIX = "[Sopeko]";

// Inject CSS for badge styling
const style = document.createElement("style");
style.textContent = `
  .sopeko-more-btn {
    position: relative;
  }
  .sopeko-dropdown {
    pointer-events: auto;
  }
  .sopeko-badge {
    position: relative;
    cursor: pointer;
  }
  .sopeko-tooltip {
    position: fixed;
    background: #1f2937;
    color: #fff;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: normal;
    white-space: nowrap;
    z-index: 999999;
    pointer-events: none;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .sopeko-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: #1f2937;
  }
  .sopeko-tooltip.visible {
    opacity: 1;
  }
`;
if (document.head) {
  document.head.appendChild(style);
} else {
  document.addEventListener("DOMContentLoaded", () => {
    document.head.appendChild(style);
  });
}

// Usernames to exclude (mods, bots, special accounts) - fetched from API
let EXCLUDED_USERNAMES = new Set();

// Cache to avoid duplicate API calls (max 100 items)
const userCache = new Map();
const USER_CACHE_MAX_SIZE = 100;

// Store observer reference for cleanup
let pageObserver = null;

console.log(LOG_PREFIX, "Script loaded");

// Debounce function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Fetch user mentions data via background script (bypasses CORS)
async function fetchUserMentions(username) {
  console.log(LOG_PREFIX, "fetchUserMentions called for:", username);

  if (userCache.has(username)) {
    console.log(
      LOG_PREFIX,
      "Cache hit for:",
      username,
      userCache.get(username),
    );
    return userCache.get(username);
  }

  console.log(
    LOG_PREFIX,
    "Sending message to background script for:",
    username,
  );

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "fetchUserMentions", username: username },
      (response) => {
        if (response && response.success) {
          console.log(
            LOG_PREFIX,
            "Received data for",
            username,
            ":",
            response.data,
          );
          // Remove oldest entries if cache is full
          while (userCache.size >= USER_CACHE_MAX_SIZE) {
            const oldestKey = userCache.keys().next().value;
            userCache.delete(oldestKey);
          }
          userCache.set(username, response.data);
          resolve(response.data);
        } else {
          console.error(
            LOG_PREFIX,
            "Failed to fetch data for",
            username,
            ":",
            response?.error,
          );
          resolve(null);
        }
      },
    );
  });
}

// Format date as "day month year" (e.g., "15 January 2024")
function formatMentionDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day} ${month} ${year}`;
}

// Determine badge color based on percent_change string
function getBadgeColor(percentChange) {
  // percentChange is a string like "+0.00%" or "-1.23%"
  const numericValue = parseFloat(percentChange);
  if (numericValue < 0) {
    return { bg: "#d32e2e", text: "#ffffff" }; // Red - negative
  } else {
    return { bg: "#169043", text: "#ffffff" }; // Green - positive
  }
}

// Create badge element for a single mention
function createBadge(item, isCompact = false) {
  const badge = document.createElement("span");
  badge.className = "sopeko-badge";

  const symbol = item.symbol;
  const percentChange = item.percent_change;
  const colors = getBadgeColor(percentChange);

  badge.style.backgroundColor = colors.bg;
  badge.style.color = colors.text;
  badge.style.marginLeft = isCompact ? "0" : "3px";
  badge.style.padding = "1px 4px";
  badge.style.borderRadius = "3px";
  badge.style.fontSize = "10px";
  badge.style.fontWeight = "bold";
  badge.style.whiteSpace = "nowrap";

  badge.textContent = `${symbol} ${percentChange}`;

  const mentionDate = formatMentionDate(
    item.mention_date || item.mentioned_at || item.date,
  );

  if (mentionDate) {
    const tooltip = document.createElement("div");
    tooltip.className = "sopeko-tooltip";
    tooltip.textContent = `Mentioned on ${mentionDate}`;
    document.body.appendChild(tooltip);

    badge.addEventListener("mouseenter", () => {
      const rect = badge.getBoundingClientRect();
      tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
      tooltip.style.top = `${rect.top - tooltip.offsetHeight - 8}px`;
      tooltip.classList.add("visible");
    });

    badge.addEventListener("mouseleave", () => {
      tooltip.classList.remove("visible");
    });
  }

  return badge;
}

// Create container with badges (max 2 visible, rest in dropdown)
function createBadges(dataArray) {
  // Filter out items with 0% change
  const filteredArray = dataArray.filter(
    (item) => item.percent_change !== "+0.00%",
  );

  if (filteredArray.length === 0) {
    return null;
  }

  const container = document.createElement("span");
  container.className = "sopeko-badges-container";
  container.style.marginLeft = "4px";
  container.style.display = "inline-flex";
  container.style.alignItems = "center";
  container.style.gap = "2px";
  container.style.position = "relative";

  const maxVisible = 2;
  const visibleItems = filteredArray.slice(0, maxVisible);
  const hiddenItems = filteredArray.slice(maxVisible);

  // Add visible badges
  visibleItems.forEach((item) => {
    const badge = createBadge(item);
    container.appendChild(badge);
  });

  // Add "more" button if there are more items
  if (hiddenItems.length > 0) {
    const moreBtn = document.createElement("span");
    moreBtn.className = "sopeko-more-btn";
    moreBtn.textContent = `+${hiddenItems.length}`;
    moreBtn.style.cssText = `
      margin-left: 3px;
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: bold;
      background-color: #6b7280;
      color: #ffffff;
      cursor: pointer;
    `;

    // Create dropdown in body (avoids overflow/z-index issues)
    const dropdown = document.createElement("div");
    dropdown.className = "sopeko-dropdown";
    dropdown.style.cssText = `
      display: none;
      position: fixed;
      padding: 4px;
      background: #1f2937;
      border: 1px solid #374151;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      z-index: 99999;
      max-height: ${hiddenItems.length > 4 ? "72px" : "auto"};
      overflow-y: ${hiddenItems.length > 4 ? "auto" : "visible"};
      overscroll-behavior: contain;
      min-width: 70px;
    `;

    hiddenItems.forEach((item) => {
      const badge = createBadge(item, true);
      badge.style.display = "block";
      badge.style.marginBottom = "2px";
      dropdown.appendChild(badge);
    });

    document.body.appendChild(dropdown);

    // Prevent scroll from propagating to page
    dropdown.addEventListener(
      "wheel",
      (e) => {
        const { scrollTop, scrollHeight, clientHeight } = dropdown;
        const atTop = scrollTop === 0 && e.deltaY < 0;
        const atBottom =
          scrollTop + clientHeight >= scrollHeight && e.deltaY > 0;

        if (atTop || atBottom) {
          e.preventDefault();
        }
        e.stopPropagation();
      },
      { passive: false },
    );

    // Show dropdown positioned directly below button
    const showDropdown = () => {
      const rect = moreBtn.getBoundingClientRect();
      dropdown.style.left = `${rect.left}px`;
      dropdown.style.top = `${rect.bottom}px`;
      dropdown.style.display = "block";
    };

    const hideDropdown = () => {
      dropdown.style.display = "none";
    };

    // Handle hover - close immediately when cursor leaves
    moreBtn.onmouseenter = showDropdown;
    moreBtn.onmouseleave = (e) => {
      // Check if moving to dropdown
      const toElement = e.relatedTarget;
      if (!dropdown.contains(toElement)) {
        hideDropdown();
      }
    };

    dropdown.onmouseleave = hideDropdown;

    container.appendChild(moreBtn);
  }

  return container;
}

// Find the flair container for a username element
function findFlairContainer(usernameElement) {
  // Navigate up to find the credit bar container (covers feed posts and post detail pages)
  const creditBar =
    usernameElement.closest('[id^="feed-post-credit-bar"]') ||
    usernameElement.closest("span.flex.flex-wrap") ||
    usernameElement.closest("div.flex.flex-row.items-center");

  if (creditBar) {
    // Find the author-flair-event-handler within the same credit bar
    const flairHandler = creditBar.querySelector("author-flair-event-handler");
    if (flairHandler) {
      // Return the nested span (the actual flair element)
      const flairSpan = flairHandler.querySelector(
        'span.bg-tone-4, span[class*="bg-tone"]',
      );
      return flairSpan || flairHandler;
    }
  }

  // Fallback: return the username element itself
  return usernameElement;
}

// Check if element already has badges
function hasBadge(element) {
  // Check in the credit bar container for badges
  const creditBar =
    element.closest('[id^="feed-post-credit-bar"]') ||
    element.closest("span.flex.flex-wrap") ||
    element.closest("div.flex.flex-row.items-center");

  if (creditBar && creditBar.querySelector(".sopeko-badges-container")) {
    return true;
  }

  return (
    element.parentElement?.querySelector(".sopeko-badges-container") !== null ||
    element.nextElementSibling?.classList?.contains("sopeko-badges-container")
  );
}

// Process a username element
async function processUsername(element) {
  if (hasBadge(element)) {
    console.log(
      LOG_PREFIX,
      "Skipping element, already has badges:",
      element.textContent,
    );
    return;
  }

  // Extract username from the element
  let username = element.textContent.trim();
  console.log(
    LOG_PREFIX,
    "Processing element with text:",
    username,
    "href:",
    element.getAttribute("href"),
  );

  // Remove 'u/' prefix if present
  if (username.startsWith("u/")) {
    username = username.substring(2);
    console.log(LOG_PREFIX, "Stripped u/ prefix, username now:", username);
  }

  // Skip empty or invalid usernames
  if (!username || username.length < 2) {
    console.log(LOG_PREFIX, "Skipping invalid username:", username);
    return;
  }

  // Skip excluded usernames (mods, bots, etc.)
  if (EXCLUDED_USERNAMES.has(username)) {
    console.log(LOG_PREFIX, "Skipping excluded username:", username);
    return;
  }

  // Mark as processing
  element.dataset.sopekoPending = "true";
  console.log(LOG_PREFIX, "Fetching data for username:", username);

  const data = await fetchUserMentions(username);

  // Only display if we have data and it's a non-empty array
  if (data && Array.isArray(data) && data.length > 0 && !hasBadge(element)) {
    console.log(
      LOG_PREFIX,
      "Creating badges for",
      username,
      "with data:",
      data,
    );
    const badgesContainer = createBadges(data);

    // Only insert if badges were created (not null when all changes are 0%)
    if (badgesContainer) {
      // Find the flair container and insert after it
      const flairContainer = findFlairContainer(element);
      flairContainer.insertAdjacentElement("afterend", badgesContainer);
      console.log(LOG_PREFIX, "Badges inserted after flair for:", username);
    } else {
      console.log(
        LOG_PREFIX,
        "No badges to display for:",
        username,
        "(all 0% changes)",
      );
    }
  } else if (!data || (Array.isArray(data) && data.length === 0)) {
    console.log(LOG_PREFIX, "No data or empty array for:", username);
  }

  delete element.dataset.sopekoPending;
}

// Find and process all usernames on the page
function processPage() {
  console.log(LOG_PREFIX, "processPage() called");

  // Reddit username selectors - covers various Reddit layouts
  const selectors = [
    // New Reddit (redesign)
    'a[href^="/user/"]',
  ];

  const selector = selectors.join(", ");
  const usernameElements = document.querySelectorAll(selector);
  console.log(
    LOG_PREFIX,
    "Found",
    usernameElements.length,
    "potential username elements",
  );

  let processedCount = 0;
  usernameElements.forEach((element) => {
    // Filter out non-username links
    const href = element.getAttribute("href") || "";
    const isUserLink =
      href.includes("/user/") ||
      href.includes("/u/") ||
      element.classList.contains("author");

    if (isUserLink && !element.dataset.sopekoPending) {
      processedCount++;
      processUsername(element);
    }
  });
  console.log(LOG_PREFIX, "Processing", processedCount, "username elements");
}

// Observe DOM changes for dynamically loaded content
function setupObserver() {
  // Disconnect existing observer if any
  if (pageObserver) {
    pageObserver.disconnect();
  }

  console.log(LOG_PREFIX, "Setting up MutationObserver");

  pageObserver = new MutationObserver(
    debounce(() => {
      console.log(LOG_PREFIX, "DOM mutation detected, re-processing page");
      processPage();
    }, 500),
  );

  pageObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log(LOG_PREFIX, "MutationObserver active");
  return pageObserver;
}

// Fetch excluded usernames from API via background script
async function fetchExcludedUsernames() {
  console.log(LOG_PREFIX, "Fetching excluded usernames from API...");

  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "fetchExcludedUsernames" },
      (response) => {
        if (response && response.success && Array.isArray(response.data)) {
          EXCLUDED_USERNAMES = new Set(response.data);
          console.log(
            LOG_PREFIX,
            "Excluded usernames loaded:",
            EXCLUDED_USERNAMES.size,
            "users",
          );
          resolve(true);
        } else {
          console.error(
            LOG_PREFIX,
            "Failed to fetch excluded usernames:",
            response?.error,
          );
          resolve(false);
        }
      },
    );
  });
}

// Initialize extension
async function init() {
  console.log(LOG_PREFIX, "=== EXTENSION INITIALIZED ===");
  console.log(LOG_PREFIX, "Current URL:", window.location.href);
  console.log(LOG_PREFIX, "Document ready state:", document.readyState);

  // Fetch excluded usernames first
  await fetchExcludedUsernames();

  // Process existing content
  processPage();

  // Watch for new content (infinite scroll, etc.)
  setupObserver();
}

// Run when DOM is ready
console.log(LOG_PREFIX, "Document readyState:", document.readyState);
if (document.readyState === "loading") {
  console.log(LOG_PREFIX, "Waiting for DOMContentLoaded...");
  document.addEventListener("DOMContentLoaded", init);
} else {
  console.log(LOG_PREFIX, "DOM already loaded, initializing immediately");
  init();
}
