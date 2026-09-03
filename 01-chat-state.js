let currentChatId = null;
let realtimeChannel = null;
let replyMessageId = null;
let pendingMessages = new Map();

let typingChannel = null;
let typingTimer = null;
let readTimer = null;
const unreadCountTimers = {};
let localLastReadMessageId = 0;

const typingUsers = {};

let currentUser = null;
let currentUsername = null;

// Синхронизируем активный чат с window для модулей, которые работают
// из изолированных IIFE (например call-v2.js). Все существующие записи
// currentChatId продолжают работать без изменения архитектуры.
try {
    Object.defineProperty(window, "currentChatId", {
        configurable: true,
        get() {
            return currentChatId;
        },
        set(value) {
            currentChatId = Number(value) || null;
        }
    });
} catch {}
