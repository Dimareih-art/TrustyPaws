import { useEffect, useMemo, useRef, useState } from "react";
import "./index.css";
import { supabase } from "./lib/supabase";

type Tab =
  | "home"
  | "upgrades"
  | "tasks"
  | "friends"
  | "shop";

type UpgradeSection =
  | "items"
  | "houses"
  | "backgrounds";

type Language = "ru" | "en" | "ua";

type Upgrade = {
  id: string;
  name: string;
  icon: string;
  description: string;
  cost: number;
  tapBonus: number;
  passiveBonus: number;
  sceneImage?: string;
  itemType?: "box" | "blanket" | "bowl";
};

type Background = {
  id: string;
  name: string;
  description: string;
  image: string;
  cost: number;
};

type PetRarity = "starter" | "common" | "rare";

type Pet = {
  id: string;
  name: string;
  image: string;
  rarity: PetRarity;
  comfortCost?: number;
  starsCost?: number;
};

type TelegramUser = {
  id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramInitData = {
  user?: TelegramUser;
  start_param?: string;
};

function getTelegramWebApp() {
  return (
    window as unknown as {
      Telegram?: {
        WebApp?: {
          initDataUnsafe?: TelegramInitData;
        };
      };
    }
  ).Telegram?.WebApp;
}

function getTelegramUser(): TelegramUser | null {
  const telegram = getTelegramWebApp();

  return telegram?.initDataUnsafe?.user ?? null;
}

function getTelegramStartParam(): string | null {
  const telegram = getTelegramWebApp();

  const startParam =
    telegram?.initDataUnsafe?.start_param;

  if (
    typeof startParam === "string" &&
    startParam.trim()
  ) {
    return startParam.trim();
  }

  /*
   * Запасной вариант.
   * Telegram также передаёт startapp
   * через GET-параметр tgWebAppStartParam.
   */
  const params =
    new URLSearchParams(
      window.location.search
    );

  return (
    params.get(
      "tgWebAppStartParam"
    )?.trim() || null
  );
}

function getReferralPlayerCode(): string | null {
  const startParam =
    getTelegramStartParam();

  if (!startParam) {
    return null;
  }

  const match =
    startParam
      .toUpperCase()
      .match(
        /^REF_(TP-[A-F0-9]{8})$/
      );

  return match?.[1] ?? null;
}

type AdsgramShowResult = {
  done: boolean;
  description: string;
  state: "load" | "render" | "playing" | "destroy";
  error: boolean;
};

type AdsgramController = {
  show: () => Promise<AdsgramShowResult>;
  destroy: () => void;
};

type AdsgramWindow = Window & {
  Adsgram?: {
    init: (params: {
      blockId: string;
      debug?: boolean;
      debugBannerType?: "RewardedVideo" | "FullscreenMedia";
    }) => AdsgramController;
  };
};

type MonetagWindow = Window & {
  show_11689364?: () => Promise<unknown>;
};

/* =====================================================
   CONSTANTS
===================================================== */

const MAX_ENERGY = 100;
const ENERGY_REGEN_MS = 2000;

const BASE_TAP_REWARD = 2;
const BASE_PASSIVE_PER_MINUTE = 0;

const DAILY_RESET_MS = 24 * 60 * 60 * 1000;

const DAILY_REWARD = 50;
const DAILY_PET_200_GOAL = 200;
const DAILY_PET_200_REWARD = 150;
const DAILY_PET_500_GOAL = 500;
const DAILY_PET_500_REWARD = 300;

const ONE_TIME_PET_1000_GOAL = 1000;
const ONE_TIME_PET_1000_REWARD = 2500;
const ONE_TIME_PET_5000_GOAL = 5000;
const ONE_TIME_PET_5000_REWARD = 15000;
const ONE_TIME_PET_10000_GOAL = 10000;
const ONE_TIME_PET_10000_REWARD = 35000;

const ONE_TIME_FRIEND_1_GOAL = 1;
const ONE_TIME_FRIEND_1_REWARD = 200;
const ONE_TIME_FRIEND_5_GOAL = 5;
const ONE_TIME_FRIEND_5_REWARD = 1000;
const ONE_TIME_FRIEND_10_GOAL = 10;
const ONE_TIME_FRIEND_10_REWARD = 50000;

/* =====================================================
   REFERRAL TASKS
   ===================================================== */

const REFERRAL_1_GOAL = 1;
const REFERRAL_1_REWARD = 500;

const REFERRAL_3_GOAL = 3;
const REFERRAL_3_REWARD = 1500;

const REFERRAL_5_GOAL = 5;
const REFERRAL_5_REWARD = 2500;

const REFERRAL_10_GOAL = 10;
const REFERRAL_10_REWARD = 10000;

const VIP_PRICE_STARS = 199;
const VIP_TAP_BONUS = 20;
const VIP_PASSIVE_PER_MINUTE = 22;
const VIP_MAX_ENERGY = 200;

const GIFT_BOX_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const ADSGRAM_REWARD_BLOCK_ID = "45286";
const ADSGRAM_REWARD_ENERGY = 100;
const ADSGRAM_REWARD_COMFORT = 150;
const ADSGRAM_SCRIPT_URL = "https://sad.adsgram.ai/js/sad.min.js";

const MONETAG_ZONE_ID = "11689364";
const MONETAG_SDK_NAME = "show_11689364";
const MONETAG_SCRIPT_URL = "https://libtl.com/sdk.js";

type GiftPrizeKind =
  | "comfort"
  | "energy"
  | "full_energy";

type GiftPrizeRarity =
  | "common"
  | "uncommon"
  | "rare"
  | "legendary";

type GiftPrizeResult = {
  kind: GiftPrizeKind;
  amount: number;
  rarity: GiftPrizeRarity;
};

const GIFT_PRIZES: Array<{
  kind: GiftPrizeKind;
  amount: number;
  weight: number;
  rarity: GiftPrizeRarity;
}> = [
  { kind: "comfort", amount: 100, weight: 30, rarity: "common" },
  { kind: "comfort", amount: 250, weight: 25, rarity: "common" },
  { kind: "comfort", amount: 500, weight: 18, rarity: "uncommon" },
  { kind: "energy", amount: 50, weight: 12, rarity: "uncommon" },
  { kind: "comfort", amount: 1000, weight: 8, rarity: "rare" },
  { kind: "full_energy", amount: 0, weight: 5, rarity: "rare" },
  { kind: "comfort", amount: 5000, weight: 2, rarity: "legendary" },
];

function rollGiftPrize() {
  const totalWeight = GIFT_PRIZES.reduce(
    (sum, prize) => sum + prize.weight,
    0
  );

  let roll = Math.random() * totalWeight;

  for (const prize of GIFT_PRIZES) {
    roll -= prize.weight;

    if (roll < 0) {
      return prize;
    }
  }

  return GIFT_PRIZES[0];
}

function formatGiftCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(
    0,
    Math.floor(totalSeconds)
  );

  const hours = Math.floor(
    safeSeconds / 3600
  );

  const minutes = Math.floor(
    (safeSeconds % 3600) / 60
  );

  const seconds =
    safeSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(
    minutes
  ).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getGiftUi(language: Language) {
  if (language === "en") {
    return {
      title: "Gift for your kitty",
      available: "READY!",
      open: "OPEN",
      nextGift: "Next gift in",
      opening: "Opening...",
      rewardTitle: "YOUR REWARD",
      claim: "Awesome!",
      comfort: "Comfort",
      energy: "Energy",
      fullEnergy: "Full energy",
      vipBonus: "VIP bonus x1.25",
      common: "Common reward",
      uncommon: "Uncommon reward",
      rare: "Rare reward",
      legendary: "Legendary reward",
      loadError: "Could not load the gift. Try again.",
    };
  }

  if (language === "ua") {
    return {
      title: "Подарунок для котика",
      available: "ДОСТУПНО!",
      open: "ВІДКРИТИ",
      nextGift: "Наступний подарунок через",
      opening: "Відкриваємо...",
      rewardTitle: "ТВОЯ НАГОРОДА",
      claim: "Супер!",
      comfort: "Затишок",
      energy: "Енергія",
      fullEnergy: "Повна енергія",
      vipBonus: "VIP-бонус x1.25",
      common: "Звичайна нагорода",
      uncommon: "Незвичайна нагорода",
      rare: "Рідкісна нагорода",
      legendary: "Легендарна нагорода",
      loadError: "Не вдалося завантажити подарунок. Спробуй ще раз.",
    };
  }

  return {
    title: "Подарок для котика",
    available: "ДОСТУПЕН!",
    open: "ОТКРЫТЬ",
    nextGift: "Следующий подарок через",
    opening: "Открываем...",
    rewardTitle: "ТВОЯ НАГРАДА",
    claim: "Супер!",
    comfort: "Комфорт",
    energy: "Энергия",
    fullEnergy: "Полная энергия",
    vipBonus: "VIP-бонус x1.25",
    common: "Обычная награда",
    uncommon: "Необычная награда",
    rare: "Редкая награда",
    legendary: "Легендарная награда",
    loadError: "Не удалось загрузить подарок. Попробуй ещё раз.",
  };
}

const DAILY_RESET_AT_KEY = "trusty_daily_reset_at";
const DAILY_PET_COUNT_KEY = "trusty_daily_pet_count";
const DAILY_PET_200_CLAIMED_KEY = "trusty_daily_pet_200_claimed";
const DAILY_PET_500_CLAIMED_KEY = "trusty_daily_pet_500_claimed";
const ONE_TIME_PET_1000_CLAIMED_KEY = "trusty_one_time_pet_1000_claimed";
const ONE_TIME_PET_5000_CLAIMED_KEY = "trusty_one_time_pet_5000_claimed";
const ONE_TIME_PET_10000_CLAIMED_KEY = "trusty_one_time_pet_10000_claimed";
const ONE_TIME_FRIEND_1_CLAIMED_KEY = "trusty_one_time_friend_1_claimed";
const ONE_TIME_FRIEND_5_CLAIMED_KEY = "trusty_one_time_friend_5_claimed";
const ONE_TIME_FRIEND_10_CLAIMED_KEY = "trusty_one_time_friend_10_claimed";



const ENERGY_STORAGE_KEY =
  "trusty_energy";

const ENERGY_TIMESTAMP_KEY =
  "trusty_energy_timestamp";

const PASSIVE_TIMESTAMP_KEY =
  "trusty_last_passive";

const LANGUAGE_STORAGE_KEY =
  "trusty_language";

const PURCHASED_PETS_STORAGE_KEY =
  "trusty_purchased_pets";

const SELECTED_PET_STORAGE_KEY =
  "trusty_selected_pet";

const assetUrl = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;

/* =====================================================
   TRANSLATIONS
===================================================== */

const translations = {
  ru: {
    settings: "Настройки",
    resetProgress: "Сбросить прогресс",
    restartGame: "Начать игру заново",
    language: "Язык",
    cancel: "Отмена",
    reset: "Сбросить",

    resetTitle: "Сбросить прогресс?",
    resetDescription:
      "Весь прогресс игры, Комфорт, покупки и имя питомца будут удалены.",

    home: "Главная",
    upgrades: "Прокачка",
    tasks: "Задания",
    friends: "Друзья",
    shop: "Магазин",

    petComfort: "КОМФОРТ ПИТОМЦА",
    comfort: "КОМФОРТ",
    perTap: "ЗА ТАП",
    yourPet: "ТВОЙ ПИТОМЕЦ",

    cold:
      "Ему всё ещё холодно...",
    warmer:
      "Ему становится теплее.",
    feelsHome:
      "Он чувствует себя дома ❤️",

    catFeelsGood: "Котику хорошо",
    gettingCozy:
      "Становится уютнее",

    tapCat:
      "🐾 Нажми на котика",
    waitEnergy:
      "⚡ Подожди восстановления энергии",

    energy: "Энергия",
    everyTwoSeconds:
      "+1 каждые 2 сек",
    fullyRestored:
      "Полностью восстановлена",

    taps: "Тапов",
    perTapLabel: "За тап",

    passiveComfort:
      "ПАССИВНЫЙ КОМФОРТ",
    passiveWorks: "работает",
    passiveInactive: "не активен",
    passiveDescription:
      "Котик приносит Комфорт, даже когда ты не нажимаешь",
    passiveLocked:
      "Пассивный доход откроется после покупки домика",

    development:
      "РАЗВИТИЕ ПИТОМЦА",
    upgradesTitle:
      "Прокачка",
    upgradesSubtitle:
      "Создавай для котика настоящий комфорт",

    income: "ДОХОД",
    passivePerMinute:
      "Комфорта / мин",
    passiveAfterHouse:
      "Пассивный доход откроется после покупки дома",

    items: "Предметы",
    houses: "Дома",
    backgrounds: "Атмосфера",

    itemsUpper: "ПРЕДМЕТЫ",
    housesUpper: "ДОМА",
    atmosphereUpper:
      "АТМОСФЕРА ЛОКАЦИИ",

    scene: "В СЦЕНЕ",
    owned: "Куплено",
    selected: "✓ Выбран",
    using: "Используется",
    choose: "Выбрать",
    free: "Бесплатно",

    backgroundNote:
      "💡 Важно: новые изображения достаточно положить в папку public/background/.",

    rewards: "НАГРАДЫ",
    tasksSubtitle:
      "Выполняй задания и забирай Комфорт",

    dailyBonus:
      "ЕЖЕДНЕВНЫЙ БОНУС",
    everyDay:
      "Заходи каждый день",
    dailyDescription:
      "Забери бесплатную награду за вход.",
    claim:
      "Забрать",
    received:
      "✓ Получено",

    activeTasks:
      "АКТИВНЫЕ ЗАДАНИЯ",

    onlineTask:
      "Проведи время в игре",
    onlineDescription:
      "Оставайся в игре 10 минут",

    petTask:
      "Погладь котика 200 раз",
    petDescription:
      "Покажи своему котику немного любви",

    taskCompleted:
      "✓ Выполнено",
    taskInProgress:
      "В процессе",

    nextTask:
      "🐾 Следующее задание доступно через",

    community:
      "СООБЩЕСТВО",
    friendsTitle:
      "Друзья",
    friendsSubtitle:
      "Скоро здесь появится настоящая система друзей",

    friendsSystem:
      "СИСТЕМА ДРУЗЕЙ",
    friendsHere:
      "Здесь будут твои друзья",
    friendsDescription:
      "Когда появится настоящая социальная система, здесь будут реальные игроки.",
    soon:
      "Скоро",

    trustyPaws:
      "TRUSTYPAWS",
    shopTitle:
      "Магазин",
    shopSubtitle:
      "Предметы, аксессуары и косметика для питомца",

    shopComing:
      "Магазин уже в пути",
    shopDescription:
      "Здесь появятся новые скины, игрушки, украшения и специальные предметы для котика.",

    introEyebrow:
      "TRUSTYPAWS",
    introTitle:
      "Придумайте имя своего нового питомца",
    introDescription:
      "Он пока ещё совсем один. Ему холодно и страшно. Но теперь у него есть ты.",
    petNamePlaceholder:
      "Имя котика",
    takePet:
      "Забрать питомца",
    introNote:
      "🌧️ Сейчас он живёт в плохих условиях. Твоя задача — постепенно сделать его жизнь комфортнее.",

    boxName:
      "Коробка",
    boxDescription:
      "Сухое место, где котику можно спрятаться от дождя.",

    blanket1:
      "Плед 1",
    blanket1Description:
      "Тёплый плед помогает котику согреться.",

    blanket2:
      "Плед 2",
    blanket2Description:
      "Мягкий плед с другим дизайном.",

    blanket3:
      "Плед 3",
    blanket3Description:
      "Более уютный и красивый плед.",

    blanket4:
      "Плед 4",
    blanket4Description:
      "Премиальный плед для настоящего уюта.",

    bowl1:
      "Миска 1",
    bowl1Description:
      "Своя миска — ещё один шаг к нормальной жизни.",

    bowl2:
      "Миска 2",
    bowl2Description:
      "Удобная миска с более приятным дизайном.",

    bowl3:
      "Миска 3",
    bowl3Description:
      "Красивая миска для ухоженного питомца.",

    bowl4:
      "Миска 4",
    bowl4Description:
      "Премиальная миска для счастливого котика.",

    house1:
      "Дом 1",
    house1Description:
      "Первый настоящий домик для питомца.",

    house2:
      "Дом 2",
    house2Description:
      "Больше места, тепла и комфорта.",

    house3:
      "Дом 3",
    house3Description:
      "Большой уютный дом для счастливого котика.",

    house4:
      "Дом 4",
    house4Description:
      "Роскошное место для отдыха.",

    house5:
      "Дом 5",
    house5Description:
      "Почти настоящий кошачий дворец.",

    villa:
      "Роскошная вилла",
    villaDescription:
      "Лучший дом, который может получить котик.",

    firstMeeting:
      "Первая Встреча",
    firstMeetingDescription:
      "Та самая стартовая локация.",

    warmEvening:
      "Тёплый Вечер",
    warmEveningDescription:
      "Более приятные условия для питомца.",

    sunnyYard:
      "Солнечный Двор",
    sunnyYardDescription:
      "Светлая атмосфера для котика.",

    greenGarden:
      "Зелёный Сад",
    greenGardenDescription:
      "Тихий сад, где котик может отдыхать.",

    nightYard:
      "Ночной Двор",
    nightYardDescription:
      "Спокойная атмосфера под звёздным небом.",

    autumnPark:
      "Осенний Парк",
    autumnParkDescription:
      "Тёплая осенняя локация.",

    winterCozy:
      "Зимний Уют",
    winterCozyDescription:
      "Снежная локация для тёплого дома.",

    premiumYard:
      "Премиальный Двор",
    premiumYardDescription:
      "Особенная локация для счастливого питомца.",

    bigGarden:
      "Большой Сад",
    bigGardenDescription:
      "Просторная зелёная территория.",

    catParadise:
      "Кошачий Рай",
    catParadiseDescription:
      "Редкая финальная атмосфера.",

    perTapText:
      "за тап",

    minuteText:
      "/мин",

    lvl:
      "LVL",
  },

  en: {
    settings: "Settings",
    resetProgress: "Reset progress",
    restartGame: "Start the game again",
    language: "Language",
    cancel: "Cancel",
    reset: "Reset",

    resetTitle: "Reset progress?",
    resetDescription:
      "All game progress, Comfort, purchases and pet name will be deleted.",

    home: "Home",
    upgrades: "Upgrades",
    tasks: "Tasks",
    friends: "Friends",
    shop: "Shop",

    petComfort: "PET COMFORT",
    comfort: "COMFORT",
    perTap: "PER TAP",
    yourPet: "YOUR PET",

    cold:
      "He is still cold...",
    warmer:
      "He is getting warmer.",
    feelsHome:
      "He feels at home ❤️",

    catFeelsGood:
      "Kitty feels good",
    gettingCozy:
      "Getting cozier",

    tapCat:
      "🐾 Tap the kitty",
    waitEnergy:
      "⚡ Wait for energy to recover",

    energy: "Energy",
    everyTwoSeconds:
      "+1 every 2 sec",
    fullyRestored:
      "Fully restored",

    taps: "Taps",
    perTapLabel: "Per tap",

    passiveComfort:
      "PASSIVE COMFORT",
    passiveWorks: "working",
    passiveInactive:
      "inactive",
    passiveDescription:
      "Your kitty earns Comfort even when you are not tapping",
    passiveLocked:
      "Passive income unlocks after buying a house",

    development:
      "PET DEVELOPMENT",
    upgradesTitle:
      "Upgrades",
    upgradesSubtitle:
      "Create real comfort for your kitty",

    income: "INCOME",
    passivePerMinute:
      "Comfort / min",
    passiveAfterHouse:
      "Passive income unlocks after buying a house",

    items: "Items",
    houses: "Houses",
    backgrounds: "Atmosphere",

    itemsUpper: "ITEMS",
    housesUpper: "HOUSES",
    atmosphereUpper:
      "LOCATION ATMOSPHERE",

    scene: "IN SCENE",
    owned: "Owned",
    selected: "✓ Selected",
    using: "Using",
    choose: "Choose",
    free: "Free",

    backgroundNote:
      "💡 Important: simply put new images into public/background/.",

    rewards: "REWARDS",
    tasksSubtitle:
      "Complete tasks and earn Comfort",

    dailyBonus:
      "DAILY BONUS",
    everyDay:
      "Come back every day",
    dailyDescription:
      "Claim a free login reward.",
    claim:
      "Claim",
    received:
      "✓ Received",

    activeTasks:
      "ACTIVE TASKS",

    onlineTask:
      "Spend time in the game",
    onlineDescription:
      "Stay in the game for 10 minutes",

    petTask:
      "Pet the kitty 200 times",
    petDescription:
      "Show your kitty some love",

    taskCompleted:
      "✓ Completed",
    taskInProgress:
      "In progress",

    nextTask:
      "🐾 Next task available in",

    community:
      "COMMUNITY",
    friendsTitle:
      "Friends",
    friendsSubtitle:
      "A real friends system will appear here soon",

    friendsSystem:
      "FRIENDS SYSTEM",
    friendsHere:
      "Your friends will be here",
    friendsDescription:
      "When the real social system is ready, real players will appear here.",
    soon:
      "Soon",

    trustyPaws:
      "TRUSTYPAWS",
    shopTitle:
      "Shop",
    shopSubtitle:
      "Items, accessories and cosmetics for your pet",

    shopComing:
      "The shop is coming",
    shopDescription:
      "New skins, toys, decorations and special items for your kitty will appear here.",

    introEyebrow:
      "TRUSTYPAWS",
    introTitle:
      "Choose a name for your new pet",
    introDescription:
      "He is still all alone. He is cold and scared. But now he has you.",
    petNamePlaceholder:
      "Kitty name",
    takePet:
      "Take the pet",
    introNote:
      "🌧️ Right now he lives in poor conditions. Your task is to gradually make his life more comfortable.",

    boxName:
      "Box",
    boxDescription:
      "A dry place where the kitty can hide from the rain.",

    blanket1:
      "Blanket 1",
    blanket1Description:
      "A warm blanket to help the kitty stay cozy.",

    blanket2:
      "Blanket 2",
    blanket2Description:
      "A soft blanket with a different design.",

    blanket3:
      "Blanket 3",
    blanket3Description:
      "A cozier and prettier blanket.",

    blanket4:
      "Blanket 4",
    blanket4Description:
      "A premium blanket for true comfort.",

    bowl1:
      "Bowl 1",
    bowl1Description:
      "A personal bowl — another step toward a better life.",

    bowl2:
      "Bowl 2",
    bowl2Description:
      "A comfortable bowl with a nicer design.",

    bowl3:
      "Bowl 3",
    bowl3Description:
      "A beautiful bowl for a well-cared-for pet.",

    bowl4:
      "Bowl 4",
    bowl4Description:
      "A premium bowl for a happy kitty.",

    house1:
      "House 1",
    house1Description:
      "The first real home for your pet.",

    house2:
      "House 2",
    house2Description:
      "More space, warmth and comfort.",

    house3:
      "House 3",
    house3Description:
      "A large cozy home for a happy kitty.",

    house4:
      "House 4",
    house4Description:
      "A luxurious place to relax.",

    house5:
      "House 5",
    house5Description:
      "Almost a real kitty palace.",

    villa:
      "Luxury Villa",
    villaDescription:
      "The best home your kitty can get.",

    firstMeeting:
      "First Meeting",
    firstMeetingDescription:
      "The original starting location.",

    warmEvening:
      "Warm Evening",
    warmEveningDescription:
      "A more pleasant environment for your pet.",

    sunnyYard:
      "Sunny Yard",
    sunnyYardDescription:
      "A bright atmosphere for your kitty.",

    greenGarden:
      "Green Garden",
    greenGardenDescription:
      "A quiet garden where the kitty can relax.",

    nightYard:
      "Night Yard",
    nightYardDescription:
      "A peaceful atmosphere under the stars.",

    autumnPark:
      "Autumn Park",
    autumnParkDescription:
      "A warm autumn location.",

    winterCozy:
      "Winter Cozy",
    winterCozyDescription:
      "A snowy location for a warm home.",

    premiumYard:
      "Premium Yard",
    premiumYardDescription:
      "A special location for a happy pet.",

    bigGarden:
      "Big Garden",
    bigGardenDescription:
      "A spacious green territory.",

    catParadise:
      "Cat Paradise",
    catParadiseDescription:
      "A rare final atmosphere.",

    perTapText:
      "per tap",

    minuteText:
      "/min",

    lvl:
      "LVL",
  },

  ua: {
    settings: "Налаштування",
    resetProgress:
      "Скинути прогрес",
    restartGame:
      "Почати гру заново",
    language: "Мова",
    cancel: "Скасувати",
    reset: "Скинути",

    resetTitle:
      "Скинути прогрес?",
    resetDescription:
      "Весь прогрес гри, Затишок, покупки та ім'я улюбленця будуть видалені.",

    home: "Головна",
    upgrades: "Покращення",
    tasks: "Завдання",
    friends: "Друзі",
    shop: "Магазин",

    petComfort:
      "ЗАТИШОК УЛЮБЛЕНЦЯ",
    comfort: "ЗАТИШОК",
    perTap: "ЗА ТАП",
    yourPet:
      "ТВІЙ УЛЮБЛЕНЕЦЬ",

    cold:
      "Йому все ще холодно...",
    warmer:
      "Йому стає тепліше.",
    feelsHome:
      "Він почувається як вдома ❤️",

    catFeelsGood:
      "Котику добре",
    gettingCozy:
      "Стає затишніше",

    tapCat:
      "🐾 Натисни на котика",
    waitEnergy:
      "⚡ Зачекай відновлення енергії",

    energy: "Енергія",
    everyTwoSeconds:
      "+1 кожні 2 сек",
    fullyRestored:
      "Повністю відновлена",

    taps: "Тапів",
    perTapLabel: "За тап",

    passiveComfort:
      "ПАСИВНИЙ ЗАТИШОК",
    passiveWorks:
      "працює",
    passiveInactive:
      "не активний",
    passiveDescription:
      "Котик приносить Затишок, навіть коли ти не натискаєш",
    passiveLocked:
      "Пасивний дохід відкриється після покупки будиночка",

    development:
      "РОЗВИТОК УЛЮБЛЕНЦЯ",
    upgradesTitle:
      "Покращення",
    upgradesSubtitle:
      "Створюй для котика справжній затишок",

    income: "ДОХІД",
    passivePerMinute:
      "Затишку / хв",
    passiveAfterHouse:
      "Пасивний дохід відкриється після покупки будинку",

    items: "Предмети",
    houses: "Будинки",
    backgrounds: "Атмосфера",

    itemsUpper: "ПРЕДМЕТИ",
    housesUpper:
      "БУДИНКИ",
    atmosphereUpper:
      "АТМОСФЕРА ЛОКАЦІЇ",

    scene: "У СЦЕНІ",
    owned: "Придбано",
    selected: "✓ Обрано",
    using: "Використовується",
    choose: "Обрати",
    free: "Безкоштовно",

    backgroundNote:
      "💡 Важливо: нові зображення достатньо покласти в папку public/background/.",

    rewards: "НАГОРОДИ",
    tasksSubtitle:
      "Виконуй завдання та отримуй Затишок",

    dailyBonus:
      "ЩОДЕННИЙ БОНУС",
    everyDay:
      "Заходь щодня",
    dailyDescription:
      "Забери безкоштовну нагороду за вхід.",
    claim: "Забрати",
    received:
      "✓ Отримано",

    activeTasks:
      "АКТИВНІ ЗАВДАННЯ",

    onlineTask:
      "Проведи час у грі",
    onlineDescription:
      "Залишайся у грі 10 хвилин",

    petTask:
      "Погладь котика 200 разів",
    petDescription:
      "Покажи своєму котику трохи любові",

    taskCompleted:
      "✓ Виконано",
    taskInProgress:
      "У процесі",

    nextTask:
      "🐾 Наступне завдання доступне через",

    community:
      "СПІЛЬНОТА",
    friendsTitle:
      "Друзі",
    friendsSubtitle:
      "Справжня система друзів скоро з'явиться тут",

    friendsSystem:
      "СИСТЕМА ДРУЗІВ",
    friendsHere:
      "Тут будуть твої друзі",
    friendsDescription:
      "Коли з'явиться справжня соціальна система, тут будуть реальні гравці.",
    soon: "Скоро",

    trustyPaws:
      "TRUSTYPAWS",
    shopTitle:
      "Магазин",
    shopSubtitle:
      "Предмети, аксесуари та косметика для улюбленця",

    shopComing:
      "Магазин вже в дорозі",
    shopDescription:
      "Тут з'являться нові скіни, іграшки, прикраси та спеціальні предмети для котика.",

    introEyebrow:
      "TRUSTYPAWS",
    introTitle:
      "Придумай ім'я своєму новому улюбленцю",
    introDescription:
      "Він поки що зовсім один. Йому холодно і страшно. Але тепер у нього є ти.",
    petNamePlaceholder:
      "Ім'я котика",
    takePet:
      "Забрати улюбленця",
    introNote:
      "🌧️ Зараз він живе у поганих умовах. Твоє завдання — поступово зробити його життя комфортнішим.",

    boxName:
      "Коробка",
    boxDescription:
      "Сухе місце, де котик може сховатися від дощу.",

    blanket1:
      "Плед 1",
    blanket1Description:
      "Теплий плед допоможе котику зігрітися.",

    blanket2:
      "Плед 2",
    blanket2Description:
      "М'який плед з іншим дизайном.",

    blanket3:
      "Плед 3",
    blanket3Description:
      "Більш затишний та красивий плед.",

    blanket4:
      "Плед 4",
    blanket4Description:
      "Преміальний плед для справжнього затишку.",

    bowl1:
      "Миска 1",
    bowl1Description:
      "Власна миска — ще один крок до нормального життя.",

    bowl2:
      "Миска 2",
    bowl2Description:
      "Зручна миска з приємнішим дизайном.",

    bowl3:
      "Миска 3",
    bowl3Description:
      "Красива миска для доглянутого улюбленця.",

    bowl4:
      "Миска 4",
    bowl4Description:
      "Преміальна миска для щасливого котика.",

    house1:
      "Будинок 1",
    house1Description:
      "Перший справжній будиночок для улюбленця.",

    house2:
      "Будинок 2",
    house2Description:
      "Більше місця, тепла та комфорту.",

    house3:
      "Будинок 3",
    house3Description:
      "Великий затишний будинок для щасливого котика.",

    house4:
      "Будинок 4",
    house4Description:
      "Розкішне місце для відпочинку.",

    house5:
      "Будинок 5",
    house5Description:
      "Майже справжній котячий палац.",

    villa:
      "Розкішна вілла",
    villaDescription:
      "Найкращий будинок, який може отримати котик.",

    firstMeeting:
      "Перша зустріч",
    firstMeetingDescription:
      "Та сама стартова локація.",

    warmEvening:
      "Теплий вечір",
    warmEveningDescription:
      "Приємніші умови для улюбленця.",

    sunnyYard:
      "Сонячний двір",
    sunnyYardDescription:
      "Світла атмосфера для котика.",

    greenGarden:
      "Зелений сад",
    greenGardenDescription:
      "Тихий сад, де котик може відпочивати.",

    nightYard:
      "Нічний двір",
    nightYardDescription:
      "Спокійна атмосфера під зоряним небом.",

    autumnPark:
      "Осінній парк",
    autumnParkDescription:
      "Тепла осіння локація.",

    winterCozy:
      "Зимовий затишок",
    winterCozyDescription:
      "Снігова локація для теплого будинку.",

    premiumYard:
      "Преміальний двір",
    premiumYardDescription:
      "Особлива локація для щасливого улюбленця.",

    bigGarden:
      "Великий сад",
    bigGardenDescription:
      "Простора зелена територія.",

    catParadise:
      "Котячий рай",
    catParadiseDescription:
      "Рідкісна фінальна атмосфера.",

    perTapText:
      "за тап",

    minuteText:
      "/хв",

    lvl:
      "РІВ",
  },
} as const;

type Translation = (typeof translations)[Language];

/* =====================================================
   STORAGE HELPERS
===================================================== */

function getStoredNumber(
  key: string,
  fallback: number
): number {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const value =
      localStorage.getItem(key);

    if (value === null) {
      return fallback;
    }

    const parsed = Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : fallback;
  } catch {
    return fallback;
  }
}

function getStoredString(
  key: string,
  fallback: string
): string {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const value =
      localStorage.getItem(key);

    return value === null
      ? fallback
      : value;
  } catch {
    return fallback;
  }
}

function getStoredBoolean(
  key: string,
  fallback: boolean
): boolean {
  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const value =
      localStorage.getItem(key);

    if (value === null) {
      return fallback;
    }

    return value === "true";
  } catch {
    return fallback;
  }
}

function getStoredArray(
  key: string
): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const value =
      localStorage.getItem(key);

    if (!value) {
      return [];
    }

    const parsed =
      JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter(
          (
            item
          ): item is string =>
            typeof item ===
            "string"
        )
      : [];
  } catch {
    return [];
  }
}

/* =====================================================
   DATA
===================================================== */

const ITEMS: Upgrade[] = [
  {
    id: "box",
    name: "Коробка",
    icon: "📦",
    description:
      "Сухое место, где котику можно спрятаться от дождя.",
    cost: 250,
    tapBonus: 1,
    passiveBonus: 0,
    sceneImage:
      assetUrl("scene/box.png"),
    itemType: "box",
  },

  {
    id: "blanket",
    name: "Плед 1",
    icon: "🧶",
    description:
      "Тёплый плед помогает котику согреться.",
    cost: 750,
    tapBonus: 1,
    passiveBonus: 0,
    sceneImage:
      assetUrl("scene/blanket.png"),
    itemType: "blanket",
  },

  {
    id: "blanket2",
    name: "Плед 2",
    icon: "🧶",
    description:
      "Мягкий плед с другим дизайном.",
    cost: 2500,
    tapBonus: 2,
    passiveBonus: 0,
    sceneImage:
      assetUrl("scene/blanket-2.png"),
    itemType: "blanket",
  },

  {
    id: "blanket3",
    name: "Плед 3",
    icon: "🧶",
    description:
      "Более уютный и красивый плед.",
    cost: 10000,
    tapBonus: 3,
    passiveBonus: 0,
    sceneImage:
      assetUrl("scene/blanket-3.png"),
    itemType: "blanket",
  },

  {
    id: "blanket4",
    name: "Плед 4",
    icon: "🧶",
    description:
      "Премиальный плед для настоящего уюта.",
    cost: 20000,
    tapBonus: 4,
    passiveBonus: 0,
    sceneImage:
      assetUrl("scene/blanket-4.png"),
    itemType: "blanket",
  },

  {
    id: "bowl",
    name: "Миска 1",
    icon: "🥣",
    description:
      "Своя миска — ещё один шаг к нормальной жизни.",
    cost: 2500,
    tapBonus: 1,
    passiveBonus: 0,
    sceneImage:
      assetUrl("scene/bowl.png"),
    itemType: "bowl",
  },

  {
    id: "bowl2",
    name: "Миска 2",
    icon: "🥣",
    description:
      "Удобная миска с более приятным дизайном.",
    cost: 5000,
    tapBonus: 2,
    passiveBonus: 0,
    sceneImage:
      assetUrl("scene/bowl-2.png"),
    itemType: "bowl",
  },

  {
    id: "bowl3",
    name: "Миска 3",
    icon: "🥣",
    description:
      "Красивая миска для ухоженного питомца.",
    cost: 15000,
    tapBonus: 3,
    passiveBonus: 0,
    sceneImage:
      assetUrl("scene/bowl-3.png"),
    itemType: "bowl",
  },

  {
    id: "bowl4",
    name: "Миска 4",
    icon: "🥣",
    description:
      "Премиальная миска для счастливого котика.",
    cost: 40000,
    tapBonus: 4,
    passiveBonus: 0,
    sceneImage:
      assetUrl("scene/bowl-4.png"),
    itemType: "bowl",
  },
];

const PETS: Pet[] = [
  {
    id: "default",
    name: "Trusty",
    image: assetUrl("cat-3d.png"),
    rarity: "starter",
    comfortCost: 0,
  },
  {
    id: "ginger",
    name: "Рыжик",
    image: assetUrl("pets/ginger.png"),
    rarity: "common",
    comfortCost: 50000,
  },
  {
    id: "black",
    name: "Черныш",
    image: assetUrl("pets/black.png"),
    rarity: "common",
    comfortCost: 75000,
  },
  {
    id: "white",
    name: "Снежок",
    image: assetUrl("pets/white.png"),
    rarity: "common",
    comfortCost: 100000,
  },
  {
    id: "gray-fold",
    name: "Дымок",
    image: assetUrl("pets/gray-fold.png"),
    rarity: "common",
    comfortCost: 150000,
  },
  {
    id: "siamese",
    name: "Сиамский",
    image: assetUrl("pets/siamese.png"),
    rarity: "common",
    comfortCost: 200000,
  },
  {
    id: "sphynx",
    name: "Сфинкс",
    image: assetUrl("pets/sphynx.png"),
    rarity: "common",
    comfortCost: 250000,
  },
  {
    id: "cosmo",
    name: "Космо",
    image: assetUrl("pets/cosmo.png"),
    rarity: "rare",
    starsCost: 299,
  },
  {
    id: "frost",
    name: "Мороз",
    image: assetUrl("pets/frost.png"),
    rarity: "rare",
    starsCost: 299,
  },
  {
    id: "sakura",
    name: "Сакура",
    image: assetUrl("pets/sakura.png"),
    rarity: "rare",
    starsCost: 299,
  },
  {
    id: "luna",
    name: "Луна",
    image: assetUrl("pets/luna.png"),
    rarity: "rare",
    starsCost: 299,
  },
  {
    id: "golden",
    name: "Золотой",
    image: assetUrl("pets/golden.png"),
    rarity: "rare",
    starsCost: 299,
  },
];

const HOUSES: Upgrade[] = [
  {
    id: "house1",
    name: "Дом 1",
    icon: "🏠",
    description:
      "Первый настоящий домик для питомца.",
    cost: 25000,
    tapBonus: 3,
    passiveBonus: 3,
    sceneImage:
      assetUrl("scene/house-1.png"),
  },

  {
    id: "house2",
    name: "Дом 2",
    icon: "🏡",
    description:
      "Больше места, тепла и комфорта.",
    cost: 125100,
    tapBonus: 5,
    passiveBonus: 5,
    sceneImage:
      assetUrl("scene/house-2.png"),
  },

  {
    id: "house3",
    name: "Дом 3",
    icon: "🏡",
    description:
      "Большой уютный дом для счастливого котика.",
    cost: 500000,
    tapBonus: 8,
    passiveBonus: 8,
    sceneImage:
      assetUrl("scene/house-3.png"),
  },

  {
    id: "house4",
    name: "Дом 4",
    icon: "🏰",
    description:
      "Роскошное место для отдыха.",
    cost: 800000,
    tapBonus: 11,
    passiveBonus: 11,
    sceneImage:
      assetUrl("scene/house-4.png"),
  },

  {
    id: "house5",
    name: "Дом 5",
    icon: "🏯",
    description:
      "Почти настоящий кошачий дворец.",
    cost: 1250000,
    tapBonus: 15,
    passiveBonus: 15,
    sceneImage:
      assetUrl("scene/house-5.png"),
  },

  {
    id: "villa",
    name: "Роскошная вилла",
    icon: "🏰",
    description:
      "Лучший дом, который может получить котик.",
    cost: 2500000,
    tapBonus: 20,
    passiveBonus: 30,
    sceneImage:
      assetUrl("scene/villa.png"),
  },
];

const BACKGROUNDS: Background[] = [
  {
    id: "background-0",
    name: "Первая Встреча",
    description:
      "Та самая стартовая локация.",
    image:
      assetUrl("background/background-0.png"),
    cost: 0,
  },

  {
    id: "background-1",
    name: "Тёплый Вечер",
    description:
      "Более приятные условия для питомца.",
    image:
      assetUrl("background/background-1.png"),
    cost: 100000,
  },

  {
    id: "background-2",
    name: "Солнечный Двор",
    description:
      "Светлая атмосфера для котика.",
    image:
      assetUrl("background/background-2.png"),
    cost: 200000,
  },

  {
    id: "background-3",
    name: "Зелёный Сад",
    description:
      "Тихий сад, где котик может отдыхать.",
    image:
      assetUrl("background/background-3.png"),
    cost: 350000,
  },

  {
    id: "background-4",
    name: "Ночной Двор",
    description:
      "Спокойная атмосфера под звёздным небом.",
    image:
      assetUrl("background/background-4.png"),
    cost: 500000,
  },

  {
    id: "background-5",
    name: "Осенний Парк",
    description:
      "Тёплая осенняя локация.",
    image:
      assetUrl("background/background-5.png"),
    cost: 700000,
  },

  {
    id: "background-6",
    name: "Зимний Уют",
    description:
      "Снежная локация для тёплого дома.",
    image:
      assetUrl("background/background-6.png"),
    cost: 900000,
  },

  {
    id: "background-7",
    name: "Премиальный Двор",
    description:
      "Особенная локация для счастливого питомца.",
    image:
      assetUrl("background/background-7.png"),
    cost: 1200000,
  },

  {
    id: "background-8",
    name: "Большой Сад",
    description:
      "Просторная зелёная территория.",
    image:
      assetUrl("background/background-8.png"),
    cost: 1500000,
  },

  {
    id: "background-9",
    name: "Кошачий Рай",
    description:
      "Редкая финальная атмосфера.",
    image:
      assetUrl("background/background-9.png"),
    cost: 2000000,
  },
];

/* =====================================================
   ENERGY
===================================================== */

function calculateOfflineEnergy(
  storedEnergy: number,
  storedTimestamp: number,
  maxEnergy: number = MAX_ENERGY
) {
  const now = Date.now();

  const safeEnergy = Math.min(
    maxEnergy,
    Math.max(
      0,
      storedEnergy
    )
  );

  if (
    !Number.isFinite(
      storedTimestamp
    ) ||
    storedTimestamp <= 0 ||
    storedTimestamp > now
  ) {
    return {
      energy: safeEnergy,
      timestamp: now,
    };
  }

  if (
    safeEnergy >= maxEnergy
  ) {
    return {
      energy: maxEnergy,
      timestamp: now,
    };
  }

  const elapsed = Math.max(
    0,
    now - storedTimestamp
  );

  const recovered =
    Math.floor(
      elapsed /
        ENERGY_REGEN_MS
    );

  const newEnergy =
    Math.min(
      maxEnergy,
      safeEnergy +
        recovered
    );

  const newTimestamp =
    newEnergy >= maxEnergy
      ? now
      : storedTimestamp +
        recovered *
          ENERGY_REGEN_MS;

  return {
    energy: newEnergy,
    timestamp: newTimestamp,
  };
}

/* =====================================================
   APP
===================================================== */

function App() {
  const [userId, setUserId] = useState<string | null>(null);
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [supabaseError, setSupabaseError] = useState("");
  const [supabaseAttempt, setSupabaseAttempt] = useState(0);
  const [activeTab, setActiveTab] =
    useState<Tab>("home");

  const [upgradeSection, setUpgradeSection] =
    useState<UpgradeSection>(
      "items"
    );

    useEffect(() => {
  if (!supabaseReady || !userId) {
    return;
  }

  const referralCode =
    getReferralPlayerCode();

  if (!referralCode) {
    return;
  }

  const registerReferral =
    async () => {
      const { data, error } =
        await supabase.rpc(
          "register_referral",
          {
            ref_code:
              referralCode,
          }
        );

      if (error) {
        console.error(
          "TrustyPaws referral registration error:",
          error
        );

        return;
      }

      console.log(
        "TrustyPaws referral processed:",
        referralCode,
        data
      );
    };

  void registerReferral();
}, [
  supabaseReady,
  userId,
]);
  /* ===================================================
     LANGUAGE
  =================================================== */

  const [language, setLanguage] =
    useState<Language>(() => {
      const stored =
        getStoredString(
          LANGUAGE_STORAGE_KEY,
          "ru"
        );

      if (
        stored === "en" ||
        stored === "ua" ||
        stored === "ru"
      ) {
        return stored;
      }

      return "ru";
    });

  const t =
    translations[language];

  useEffect(() => {
    localStorage.setItem(
      LANGUAGE_STORAGE_KEY,
      language
    );
  }, [language]);

  /* ===================================================
     GAME STATE
  =================================================== */

 const [energy, setEnergy] =
  useState(() => {
    const storedEnergy =
      getStoredNumber(
        ENERGY_STORAGE_KEY,
        MAX_ENERGY
      );

    return Math.max(
      0,
      storedEnergy
    );
  });

  const [comfort, setComfort] =
    useState(() =>
      getStoredNumber(
        "trusty_comfort",
        0
      )
    );

  const adsgramControllerRef =
    useRef<AdsgramController | null>(null);

  const [adLoading, setAdLoading] =
    useState(false);

  const [adError, setAdError] =
    useState("");

  const [petCount, setPetCount] =
    useState(() =>
      getStoredNumber(
        "trusty_pet_count",
        0
      )
    );

  const [purchased, setPurchased] =
    useState<string[]>(() =>
      getStoredArray(
        "trusty_upgrades"
      )
    );

  const [
    purchasedBackgrounds,
    setPurchasedBackgrounds,
  ] = useState<string[]>(() =>
    getStoredArray(
      "trusty_backgrounds"
    )
  );

  const [
    selectedBackground,
    setSelectedBackground,
  ] = useState(() =>
    getStoredString(
      "trusty_selected_background",
      "background-0"
    )
  );

  const [purchasedPets, setPurchasedPets] =
    useState<string[]>(() => {
      const stored = getStoredArray(
        PURCHASED_PETS_STORAGE_KEY
      );

      return stored.includes("default")
        ? stored
        : ["default", ...stored];
    });

  const [selectedPet, setSelectedPet] =
    useState(() =>
      getStoredString(
        SELECTED_PET_STORAGE_KEY,
        "default"
      )
    );

  const [petsLoaded, setPetsLoaded] =
    useState(false);

  const [dailyAvailable, setDailyAvailable] =
    useState(() =>
      getStoredBoolean(
        "trusty_daily_available",
        true
      )
    );

  const [dailyPetCount, setDailyPetCount] =
    useState(() =>
      getStoredNumber(
        DAILY_PET_COUNT_KEY,
        0
      )
    );

  const [dailyPet200Claimed, setDailyPet200Claimed] =
    useState(() =>
      getStoredBoolean(
        DAILY_PET_200_CLAIMED_KEY,
        false
      )
    );

  const [dailyPet500Claimed, setDailyPet500Claimed] =
    useState(() =>
      getStoredBoolean(
        DAILY_PET_500_CLAIMED_KEY,
        false
      )
    );

  const [oneTimePet1000Claimed, setOneTimePet1000Claimed] =
    useState(() =>
      getStoredBoolean(
        ONE_TIME_PET_1000_CLAIMED_KEY,
        false
      )
    );

  const [oneTimePet5000Claimed, setOneTimePet5000Claimed] =
    useState(() =>
      getStoredBoolean(ONE_TIME_PET_5000_CLAIMED_KEY, false)
    );

  const [oneTimePet10000Claimed, setOneTimePet10000Claimed] =
    useState(() =>
      getStoredBoolean(ONE_TIME_PET_10000_CLAIMED_KEY, false)
    );

  const [oneTimeFriend1Claimed, setOneTimeFriend1Claimed] =
    useState(() =>
      getStoredBoolean(ONE_TIME_FRIEND_1_CLAIMED_KEY, false)
    );

  const [oneTimeFriend5Claimed, setOneTimeFriend5Claimed] =
    useState(() =>
      getStoredBoolean(ONE_TIME_FRIEND_5_CLAIMED_KEY, false)
    );

  const [oneTimeFriend10Claimed, setOneTimeFriend10Claimed] =
    useState(() =>
      getStoredBoolean(ONE_TIME_FRIEND_10_CLAIMED_KEY, false)
    );

  const [friendCount, setFriendCount] = useState(0);

  const [referralCount, setReferralCount] =
  useState(0);

const [
  referral1Claimed,
  setReferral1Claimed,
] = useState(false);

const [
  referral3Claimed,
  setReferral3Claimed,
] = useState(false);

const [
  referral5Claimed,
  setReferral5Claimed,
] = useState(false);

const [
  referral10Claimed,
  setReferral10Claimed,
] = useState(false);

  const [dailyResetAt, setDailyResetAt] =
  useState(() => {
    const stored = getStoredNumber(
      DAILY_RESET_AT_KEY,
      0
    );

    if (
      Number.isFinite(stored) &&
      stored > 0
    ) {
      return stored;
    }

    return Date.now() + DAILY_RESET_MS;
  });

  const [taskNow, setTaskNow] =
    useState(() => Date.now());

  const [petName, setPetName] =
    useState(() =>
      getStoredString(
        "trusty_pet_name",
        ""
      )
    );

  const [nameInput, setNameInput] =
    useState("");

  const [gameStarted, setGameStarted] =
    useState(() =>
      getStoredBoolean(
        "trusty_game_started",
        false
      )
    );

  const [tapAnimation, setTapAnimation] =
    useState(0);

  const [rewardValue, setRewardValue] =
    useState(0);

  const [showReward, setShowReward] =
    useState(false);

  const [menuOpen, setMenuOpen] =
    useState(false);

  const [resetModalOpen, setResetModalOpen] =
    useState(false);

  const [vipActive, setVipActive] =
    useState(false);

  const [vipStatusLoaded, setVipStatusLoaded] =
    useState(false);

  const [, setVipExpiresAt] =
    useState<string | null>(null);

  const [giftBoxNextAt, setGiftBoxNextAt] =
    useState<number>(0);

  const [giftBoxLoaded, setGiftBoxLoaded] =
    useState(false);

  const [giftBoxOpening, setGiftBoxOpening] =
    useState(false);

  const [giftBoxPrize, setGiftBoxPrize] =
    useState<GiftPrizeResult | null>(null);

  const [giftBoxNow, setGiftBoxNow] =
    useState(() => Date.now());

  const [giftBoxError, setGiftBoxError] =
    useState("");

  useEffect(() => {
  if (
    !supabaseReady ||
    !userId ||
    petCount < 100
  ) {
    return;
  }

  let cancelled = false;

  const confirmReferral = async () => {
    const { data, error } =
      await supabase.rpc(
        "confirm_referral_if_ready"
      );

    if (cancelled) {
      return;
    }

    if (error) {
      console.error(
        "TrustyPaws referral confirmation error:",
        error
      );

      return;
    }

    if (data) {
      console.log(
        "TrustyPaws referral confirmed"
      );
    }
  };

  const timer = window.setTimeout(() => {
    void confirmReferral();
  }, 2000);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}, [
  supabaseReady,
  userId,
  petCount,
]);

  /* ===================================================
     SUPABASE AUTH + PLAYER PROFILE
  =================================================== */

  useEffect(() => {
    let cancelled = false;

    const ensurePlayerProfile = async (id: string) => {
      const { error } = await supabase
        .from("profiles")
        .upsert(
          { id },
          {
            onConflict: "id",
            ignoreDuplicates: true,
          }
        );

      if (error) {
        console.error(
          "TrustyPaws profile creation error:",
          error
        );
      }
    };

    const initSupabaseUser = async () => {
      try {
        if (!cancelled) {
          setSupabaseReady(false);
          setSupabaseError("");
        }

        console.log("TrustyPaws: connecting to Supabase...");

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error(
            "TrustyPaws getSession error:",
            sessionError
          );
        }

        let user = session?.user ?? null;

        if (!user) {
          console.log(
            "TrustyPaws: no session, creating anonymous user..."
          );

          const { data, error } =
            await supabase.auth.signInAnonymously();

          if (error) {
            console.error(
              "TrustyPaws anonymous login error:",
              error
            );

            if (!cancelled) {
              setSupabaseError(error.message || "Anonymous login failed");
              setSupabaseReady(true);
            }

            return;
          }

          user = data.user;
        }

        if (!user) {
          console.error(
            "TrustyPaws: Supabase returned no user."
          );

          if (!cancelled) {
            setSupabaseError("Supabase returned no user");
            setSupabaseReady(true);
          }

          return;
        }

        await ensurePlayerProfile(user.id);

        if (!cancelled) {
          setUserId(user.id);
          setSupabaseError("");
          setSupabaseReady(true);
        }

        console.log(
          "TrustyPaws Supabase user:",
          user.id
        );
      } catch (error) {
        console.error(
          "TrustyPaws Supabase initialization error:",
          error
        );

        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "Unknown Supabase initialization error";

          setSupabaseError(message);
          setSupabaseReady(true);
        }
      }
    };

    void initSupabaseUser();

    return () => {
      cancelled = true;
    };
  }, [supabaseAttempt]);

  /* ===================================================
     VIP STATUS
  =================================================== */

  useEffect(() => {
    if (!supabaseReady || !userId) {
      setVipActive(false);
      setVipExpiresAt(null);
      setVipStatusLoaded(false);
      return;
    }

    let cancelled = false;

    const loadVipStatus = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("is_vip,vip_expires_at")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("TrustyPaws VIP status error:", error);
        return;
      }

      if (cancelled) return;

      const expiresAt = data?.vip_expires_at ?? null;
      const active = Boolean(
        data?.is_vip === true &&
          expiresAt &&
          new Date(expiresAt).getTime() > Date.now()
      );

      setVipActive(active);
      setVipExpiresAt(expiresAt);
      setVipStatusLoaded(true);
    };

    void loadVipStatus();

    const timer = window.setInterval(() => {
      void loadVipStatus();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [supabaseReady, userId]);

  const maxEnergy = vipActive
    ? VIP_MAX_ENERGY
    : MAX_ENERGY;

  /* ===================================================
     MONETAG REWARDED INTERSTITIAL
  =================================================== */

  useEffect(() => {
    const existingScript =
      document.querySelector<HTMLScriptElement>(
        `script[data-zone="${MONETAG_ZONE_ID}"][data-sdk="${MONETAG_SDK_NAME}"]`
      );

    if (existingScript) {
      return;
    }

    const script =
      document.createElement("script");

    script.src = MONETAG_SCRIPT_URL;
    script.async = true;
    script.setAttribute(
      "data-zone",
      MONETAG_ZONE_ID
    );
    script.setAttribute(
      "data-sdk",
      MONETAG_SDK_NAME
    );

    document.head.appendChild(script);
  }, []);

  /* ===================================================
     ADSGRAM REWARDED AD
  =================================================== */

  useEffect(() => {
    let cancelled = false;

    const initAdsgram = () => {
      if (cancelled || adsgramControllerRef.current) {
        return;
      }

      const adsgram =
        (window as AdsgramWindow).Adsgram;

      if (!adsgram) {
        return;
      }

      adsgramControllerRef.current =
        adsgram.init({
          blockId: ADSGRAM_REWARD_BLOCK_ID,
          debug: false,
        });
    };

    const existingScript =
      document.querySelector<HTMLScriptElement>(
        `script[src="${ADSGRAM_SCRIPT_URL}"]`
      );

    if (existingScript) {
      if ((window as AdsgramWindow).Adsgram) {
        initAdsgram();
      } else {
        existingScript.addEventListener(
          "load",
          initAdsgram,
          { once: true }
        );
      }
    } else {
      const script =
        document.createElement("script");

      script.src = ADSGRAM_SCRIPT_URL;
      script.async = true;
      script.addEventListener(
        "load",
        initAdsgram,
        { once: true }
      );

      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, []);

  /* ===================================================
     DAILY GIFT BOX
  =================================================== */

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGiftBoxNow(Date.now());
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!supabaseReady || !userId) {
      setGiftBoxLoaded(false);
      setGiftBoxNextAt(0);
      return;
    }

    let cancelled = false;

    const loadGiftBox = async () => {
      setGiftBoxError("");

      const { data, error } = await supabase
        .from("profiles")
        .select("gift_box_next_at")
        .eq("id", userId)
        .single();

      if (cancelled) return;

      if (error) {
        console.error(
          "TrustyPaws gift box loading error:",
          error
        );
        setGiftBoxLoaded(false);
        setGiftBoxError(getGiftUi(language).loadError);
        return;
      }

      const nextAt = data?.gift_box_next_at
        ? new Date(data.gift_box_next_at).getTime()
        : 0;

      setGiftBoxNextAt(
        Number.isFinite(nextAt) ? nextAt : 0
      );
      setGiftBoxLoaded(true);
    };

    void loadGiftBox();

    return () => {
      cancelled = true;
    };
  }, [supabaseReady, userId, language]);

  const giftBoxAvailable =
    giftBoxLoaded &&
    !giftBoxOpening &&
    giftBoxNextAt <= giftBoxNow;

  const giftBoxSecondsLeft =
    giftBoxNextAt > giftBoxNow
      ? Math.ceil(
          (giftBoxNextAt - giftBoxNow) / 1000
        )
      : 0;

  const openGiftBox = async () => {
    if (
      !supabaseReady ||
      !userId ||
      !giftBoxLoaded ||
      giftBoxOpening
    ) {
      return;
    }

    const now = Date.now();

    if (giftBoxNextAt > now) {
      return;
    }

    setGiftBoxOpening(true);
    setGiftBoxError("");

    try {
      const { data: latestProfile, error: loadError } =
        await supabase
          .from("profiles")
          .select("gift_box_next_at")
          .eq("id", userId)
          .single();

      if (loadError) {
        throw loadError;
      }

      const latestNextAt =
        latestProfile?.gift_box_next_at
          ? new Date(
              latestProfile.gift_box_next_at
            ).getTime()
          : 0;

      if (
        Number.isFinite(latestNextAt) &&
        latestNextAt > now
      ) {
        setGiftBoxNextAt(latestNextAt);
        return;
      }

      const rolledPrize = rollGiftPrize();

      const finalAmount =
        rolledPrize.kind === "comfort" &&
        vipActive
          ? Math.round(
              rolledPrize.amount * 1.25
            )
          : rolledPrize.amount;

      const newComfort =
        rolledPrize.kind === "comfort"
          ? comfort + finalAmount
          : comfort;

      const newEnergy =
        rolledPrize.kind === "full_energy"
          ? maxEnergy
          : rolledPrize.kind === "energy"
          ? Math.min(
              maxEnergy,
              energy + finalAmount
            )
          : energy;

      const nextAt =
        now + GIFT_BOX_COOLDOWN_MS;

      const { error: updateError } =
        await supabase
          .from("profiles")
          .update({
            gift_box_next_at:
              new Date(nextAt).toISOString(),
            comfort: newComfort,
            energy: Math.round(newEnergy),
            updated_at:
              new Date().toISOString(),
          })
          .eq("id", userId);

      if (updateError) {
        throw updateError;
      }

      if (rolledPrize.kind === "comfort") {
        setComfort(newComfort);
      }

      if (
        rolledPrize.kind === "energy" ||
        rolledPrize.kind === "full_energy"
      ) {
        setEnergy(newEnergy);

        localStorage.setItem(
          ENERGY_STORAGE_KEY,
          String(newEnergy)
        );

        localStorage.setItem(
          ENERGY_TIMESTAMP_KEY,
          String(now)
        );
      }

      setGiftBoxNextAt(nextAt);
      setGiftBoxNow(now);
      setGiftBoxPrize({
        kind: rolledPrize.kind,
        amount: finalAmount,
        rarity: rolledPrize.rarity,
      });
    } catch (error) {
      console.error(
        "TrustyPaws gift box opening error:",
        error
      );
      setGiftBoxError(
        getGiftUi(language).loadError
      );
    } finally {
      setGiftBoxOpening(false);
    }
  };

  /* ===================================================
     UPGRADES
  =================================================== */

  const allUpgrades = useMemo(
    () => [
      ...ITEMS,
      ...HOUSES,
    ],
    []
  );

  const housePassivePerMinute =
    useMemo(() => {
      const highestPurchasedHouse =
        [...HOUSES]
          .reverse()
          .find((house) =>
            purchased.includes(house.id)
          );

      return (
        highestPurchasedHouse?.passiveBonus ??
        BASE_PASSIVE_PER_MINUTE
      );
    }, [purchased]);

  const passivePerMinute =
    housePassivePerMinute +
    (vipActive ? VIP_PASSIVE_PER_MINUTE : 0);

  const upgradeBonus =
    useMemo(() => {
      return allUpgrades.reduce(
        (
          total,
          upgrade
        ) => {
          if (
            purchased.includes(
              upgrade.id
            )
          ) {
            return (
              total +
              upgrade.tapBonus
            );
          }

          return total;
        },
        0
      );
    }, [
      purchased,
      allUpgrades,
    ]);

  const tapReward =
    BASE_TAP_REWARD +
    upgradeBonus +
    (vipActive ? VIP_TAP_BONUS : 0);

  /* ===================================================
     PETS FROM SUPABASE

     Supabase является главным источником данных по
     купленным и выбранному питомцу. localStorage остаётся
     только локальным кэшем для интерфейса.
  =================================================== */

  useEffect(() => {
    if (!supabaseReady || !userId) {
      setPetsLoaded(false);
      return;
    }

    let cancelled = false;

    const loadPets = async () => {
      setPetsLoaded(false);

      const { data, error } = await supabase
        .from("profiles")
        .select("purchased_pets,selected_pet")
        .eq("id", userId)
        .single();

      if (error) {
        console.error(
          "TrustyPaws pets loading error:",
          error
        );

        if (!cancelled) {
          setPurchasedPets(["default"]);
          setSelectedPet("default");
          setPetsLoaded(true);
        }

        return;
      }

      if (cancelled) return;

      const validPetIds = new Set(
        PETS.map((pet) => pet.id)
      );

      const serverPets = Array.isArray(data?.purchased_pets)
        ? data.purchased_pets.filter(
            (value): value is string =>
              typeof value === "string" &&
              validPetIds.has(value)
          )
        : [];

      const normalizedPets = Array.from(
        new Set(["default", ...serverPets])
      );

      const serverSelected =
        typeof data?.selected_pet === "string"
          ? data.selected_pet
          : "default";

      const normalizedSelected =
        normalizedPets.includes(serverSelected) &&
        validPetIds.has(serverSelected)
          ? serverSelected
          : "default";

      setPurchasedPets(normalizedPets);
      setSelectedPet(normalizedSelected);
      setPetsLoaded(true);
    };

    void loadPets();

    return () => {
      cancelled = true;
    };
  }, [supabaseReady, userId]);

  /* ===================================================
     SUPABASE PROFILE SYNC

     Сохраняем игровой профиль в облако с небольшой
     задержкой, чтобы не отправлять запрос на каждый тап.
  =================================================== */

  useEffect(() => {
    if (!supabaseReady || !userId || !petsLoaded) {
      return;
    }

    const timer = window.setTimeout(async () => {
      const username = `TP-${userId
        .replace(/-/g, "")
        .slice(0, 8)
        .toUpperCase()}`;

      const telegramUser = getTelegramUser();

      const telegramUsername =
        telegramUser?.username?.trim() || null;

      const telegramName =
        [telegramUser?.first_name, telegramUser?.last_name]
          .filter((value): value is string => Boolean(value?.trim()))
          .join(" ")
          .trim() || null;

      const level = 1 + purchased.length;

      const { error } = await supabase
        .from("profiles")
        .upsert(
          {
            id: userId,
            username,
            telegram_username: telegramUsername,
            telegram_name: telegramName,
            pet_name: petName,
            comfort,
            energy: Math.round(energy),
            taps: petCount,
            level,
            selected_background: selectedBackground,
            purchased,
            purchased_backgrounds: purchasedBackgrounds,
            purchased_pets: purchasedPets,
            selected_pet: selectedPet,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "id",
          }
        );

      if (error) {
        console.error(
          "TrustyPaws profile sync error:",
          error
        );
        return;
      }

      console.log(
        "TrustyPaws profile synced:",
        username
      );
    }, 900);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    supabaseReady,
    userId,
    petName,
    comfort,
    energy,
    petCount,
    purchased,
    purchasedBackgrounds,
    selectedBackground,
    purchasedPets,
    selectedPet,
    petsLoaded,
  ]);

  /* ===================================================
     SAVE
  =================================================== */

  useEffect(() => {
    localStorage.setItem(
      "trusty_comfort",
      String(comfort)
    );
  }, [comfort]);

  useEffect(() => {
    localStorage.setItem(
      "trusty_pet_count",
      String(petCount)
    );
  }, [petCount]);

  useEffect(() => {
    localStorage.setItem(
      "trusty_upgrades",
      JSON.stringify(purchased)
    );
  }, [purchased]);

  useEffect(() => {
    localStorage.setItem(
      "trusty_backgrounds",
      JSON.stringify(
        purchasedBackgrounds
      )
    );
  }, [purchasedBackgrounds]);

  useEffect(() => {
    localStorage.setItem(
      PURCHASED_PETS_STORAGE_KEY,
      JSON.stringify(purchasedPets)
    );
  }, [purchasedPets]);

  useEffect(() => {
    localStorage.setItem(
      SELECTED_PET_STORAGE_KEY,
      selectedPet
    );
  }, [selectedPet]);

  useEffect(() => {
    localStorage.setItem(
      "trusty_selected_background",
      selectedBackground
    );
  }, [selectedBackground]);

  useEffect(() => {
    localStorage.setItem(
      "trusty_daily_available",
      String(dailyAvailable)
    );
  }, [dailyAvailable]);


  useEffect(() => {
    localStorage.setItem(
      DAILY_PET_COUNT_KEY,
      String(dailyPetCount)
    );
  }, [dailyPetCount]);

  useEffect(() => {
    localStorage.setItem(
      DAILY_PET_200_CLAIMED_KEY,
      String(dailyPet200Claimed)
    );
  }, [dailyPet200Claimed]);

  useEffect(() => {
    localStorage.setItem(
      DAILY_PET_500_CLAIMED_KEY,
      String(dailyPet500Claimed)
    );
  }, [dailyPet500Claimed]);

  useEffect(() => {
    localStorage.setItem(
      ONE_TIME_PET_1000_CLAIMED_KEY,
      String(oneTimePet1000Claimed)
    );
  }, [oneTimePet1000Claimed]);

  useEffect(() => {
    localStorage.setItem(ONE_TIME_PET_5000_CLAIMED_KEY, String(oneTimePet5000Claimed));
  }, [oneTimePet5000Claimed]);

  useEffect(() => {
    localStorage.setItem(ONE_TIME_PET_10000_CLAIMED_KEY, String(oneTimePet10000Claimed));
  }, [oneTimePet10000Claimed]);

  useEffect(() => {
    localStorage.setItem(ONE_TIME_FRIEND_1_CLAIMED_KEY, String(oneTimeFriend1Claimed));
  }, [oneTimeFriend1Claimed]);

  useEffect(() => {
    localStorage.setItem(ONE_TIME_FRIEND_5_CLAIMED_KEY, String(oneTimeFriend5Claimed));
  }, [oneTimeFriend5Claimed]);

  useEffect(() => {
    localStorage.setItem(ONE_TIME_FRIEND_10_CLAIMED_KEY, String(oneTimeFriend10Claimed));
  }, [oneTimeFriend10Claimed]);

  useEffect(() => {
    localStorage.setItem(
      DAILY_RESET_AT_KEY,
      String(dailyResetAt)
    );
  }, [dailyResetAt]);

  /* ===================================================
     FRIEND COUNT FOR ONE-TIME TASKS
  =================================================== */

  useEffect(() => {
    if (!supabaseReady || !userId) {
      setFriendCount(0);
      return;
    }

    let cancelled = false;

    const loadFriendCount = async () => {
      const { data, error } = await supabase
        .from("friendships")
        .select("id,user_id,friend_id")
        .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

      if (error) {
        console.error("TrustyPaws friend count error:", error);
        return;
      }

      if (!cancelled) {
        setFriendCount((data ?? []).length);
      }
    };

    void loadFriendCount();

    const timer = window.setInterval(() => {
      void loadFriendCount();
    }, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [supabaseReady, userId, activeTab]);

  /* ===================================================
   CONFIRMED REFERRAL COUNT FOR TASKS
=================================================== */

useEffect(() => {
  if (!supabaseReady || !userId) {
    setReferralCount(0);
    return;
  }

  let cancelled = false;

  const loadReferralCount = async () => {
    const { count, error } =
      await supabase
        .from("referrals")
        .select("id", {
          count: "exact",
          head: true,
        })

        .eq("referrer_id", userId)
        .eq("status", "confirmed");

    if (error) {
      console.error(
        "TrustyPaws referral task count error:",
        error
      );
      return;
    }

    if (!cancelled) {
      setReferralCount(count ?? 0);
    }
  };

  void loadReferralCount();

  const timer = window.setInterval(() => {
    void loadReferralCount();
  }, 15000);

  return () => {
    cancelled = true;
    window.clearInterval(timer);
  };
}, [
  supabaseReady,
  userId,
  activeTab,
]);

/* ===================================================
   REFERRAL REWARD CLAIMS FROM SUPABASE
=================================================== */

useEffect(() => {
  if (!supabaseReady || !userId) {
    setReferral1Claimed(false);
    setReferral3Claimed(false);
    setReferral5Claimed(false);
    setReferral10Claimed(false);
    return;
  }

  let cancelled = false;

  const loadReferralClaims = async () => {
    const { data, error } =
      await supabase
        .from("referral_task_claims")
        .select("task_key")
        .eq("user_id", userId);

    if (error) {
      console.error(
        "TrustyPaws referral claims load error:",
        error
      );
      return;
    }

    if (cancelled) {
      return;
    }

    const claimedTasks = new Set(
      (data ?? []).map(
        (row) => row.task_key
      )
    );

    setReferral1Claimed(
      claimedTasks.has("referral_1")
    );

    setReferral3Claimed(
      claimedTasks.has("referral_3")
    );

    setReferral5Claimed(
      claimedTasks.has("referral_5")
    );

    setReferral10Claimed(
      claimedTasks.has("referral_10")
    );
  };

  void loadReferralClaims();

  return () => {
    cancelled = true;
  };
}, [
  supabaseReady,
  userId,
]);

  /* ===================================================
     DAILY TASK RESET — ONE SHARED 24H TIMER
  =================================================== */

  useEffect(() => {
    const resetDailyTasksIfNeeded = () => {
      const now = Date.now();
      setTaskNow(now);

      if (now < dailyResetAt) {
        return;
      }

      const nextResetAt = now + DAILY_RESET_MS;

      setDailyAvailable(true);
      setDailyPetCount(0);
      setDailyPet200Claimed(false);
      setDailyPet500Claimed(false);
      setDailyResetAt(nextResetAt);

      localStorage.setItem(
        "trusty_daily_available",
        "true"
      );
      localStorage.setItem(
        DAILY_PET_COUNT_KEY,
        "0"
      );
      localStorage.setItem(
        DAILY_PET_200_CLAIMED_KEY,
        "false"
      );
      localStorage.setItem(
        DAILY_PET_500_CLAIMED_KEY,
        "false"
      );
      localStorage.setItem(
        DAILY_RESET_AT_KEY,
        String(nextResetAt)
      );
    };

    resetDailyTasksIfNeeded();

    const timer = window.setInterval(
      resetDailyTasksIfNeeded,
      1000
    );

    const onVisibility = () => {
      if (!document.hidden) {
        resetDailyTasksIfNeeded();
      }
    };

    document.addEventListener(
      "visibilitychange",
      onVisibility
    );

    window.addEventListener(
      "focus",
      resetDailyTasksIfNeeded
    );

    return () => {
      window.clearInterval(timer);
      document.removeEventListener(
        "visibilitychange",
        onVisibility
      );
      window.removeEventListener(
        "focus",
        resetDailyTasksIfNeeded
      );
    };
  }, [dailyResetAt]);

  useEffect(() => {
    localStorage.setItem(
      "trusty_pet_name",
      petName
    );
  }, [petName]);

  useEffect(() => {
    localStorage.setItem(
      "trusty_game_started",
      String(gameStarted)
    );
  }, [gameStarted]);

  useEffect(() => {
    localStorage.setItem(
      ENERGY_STORAGE_KEY,
      String(energy)
    );
  }, [energy]);

  /* ===================================================
     ENERGY REGEN
  =================================================== */

  useEffect(() => {
    if (!vipStatusLoaded) {
      return;
    }

    const timer =
      window.setInterval(() => {
        const now =
          Date.now();

        const storedEnergy =
          getStoredNumber(
            ENERGY_STORAGE_KEY,
            energy
          );

        const storedTimestamp =
          getStoredNumber(
            ENERGY_TIMESTAMP_KEY,
            now
          );

        const result =
          calculateOfflineEnergy(
            storedEnergy,
            storedTimestamp,
            maxEnergy
          );

        if (
          result.energy !==
          storedEnergy
        ) {
          setEnergy(
            result.energy
          );
        }

        localStorage.setItem(
          ENERGY_STORAGE_KEY,
          String(result.energy)
        );

        localStorage.setItem(
          ENERGY_TIMESTAMP_KEY,
          String(
            result.timestamp
          )
        );
      }, 1000);

    return () =>
      window.clearInterval(
        timer
      );
  }, [energy, maxEnergy, vipStatusLoaded]);

  /* ===================================================
     ENERGY VISIBILITY
  =================================================== */

  useEffect(() => {
    if (!vipStatusLoaded) {
      return;
    }

    const syncEnergy = () => {
      const now =
        Date.now();

      const storedEnergy =
        getStoredNumber(
          ENERGY_STORAGE_KEY,
          energy
        );

      const storedTimestamp =
        getStoredNumber(
          ENERGY_TIMESTAMP_KEY,
          now
        );

      const result =
        calculateOfflineEnergy(
          storedEnergy,
          storedTimestamp,
          maxEnergy
        );

      setEnergy(
        result.energy
      );

      localStorage.setItem(
        ENERGY_STORAGE_KEY,
        String(result.energy)
      );

      localStorage.setItem(
        ENERGY_TIMESTAMP_KEY,
        String(
          result.timestamp
        )
      );
    };

    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          "visible"
        ) {
          syncEnergy();
        }
      };

    window.addEventListener(
      "focus",
      syncEnergy
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibility
    );

    return () => {
      window.removeEventListener(
        "focus",
        syncEnergy
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibility
      );
    };
  }, [energy, maxEnergy, vipStatusLoaded]);

  useEffect(() => {
  if (!supabaseReady || !userId || !vipStatusLoaded) {
    return;
  }

  const now = Date.now();

  const storedEnergy =
    getStoredNumber(
      ENERGY_STORAGE_KEY,
      maxEnergy
    );

  const storedTimestamp =
    getStoredNumber(
      ENERGY_TIMESTAMP_KEY,
      now
    );

  const result =
    calculateOfflineEnergy(
      storedEnergy,
      storedTimestamp,
      maxEnergy
    );

  setEnergy(result.energy);

  localStorage.setItem(
    ENERGY_STORAGE_KEY,
    String(result.energy)
  );

  localStorage.setItem(
    ENERGY_TIMESTAMP_KEY,
    String(result.timestamp)
  );
}, [maxEnergy, supabaseReady, userId, vipStatusLoaded]);

  /* ===================================================
     PASSIVE INCOME
  =================================================== */

  useEffect(() => {
    const now =
      Date.now();

    const lastTime =
      getStoredNumber(
        PASSIVE_TIMESTAMP_KEY,
        now
      );

    if (
      !Number.isFinite(
        lastTime
      ) ||
      lastTime > now ||
      lastTime <= 0
    ) {
      localStorage.setItem(
        PASSIVE_TIMESTAMP_KEY,
        String(now)
      );

      return;
    }

    const elapsedMinutes =
      (now - lastTime) /
      60000;

    if (
      elapsedMinutes > 0 &&
      passivePerMinute > 0
    ) {
      setComfort(
        (current) =>
          current +
          elapsedMinutes *
            passivePerMinute
      );
    }

    localStorage.setItem(
      PASSIVE_TIMESTAMP_KEY,
      String(now)
    );
  }, [passivePerMinute]);

  useEffect(() => {
    const timer =
      window.setInterval(() => {
        const now =
          Date.now();

        const previous =
          getStoredNumber(
            PASSIVE_TIMESTAMP_KEY,
            now
          );

        if (
          !Number.isFinite(
            previous
          ) ||
          previous > now
        ) {
          localStorage.setItem(
            PASSIVE_TIMESTAMP_KEY,
            String(now)
          );

          return;
        }

        const elapsedMs =
          now - previous;

        if (
          elapsedMs < 1000
        ) {
          return;
        }

        const reward =
          (elapsedMs / 60000) *
          passivePerMinute;

        if (
          reward > 0
        ) {
          setComfort(
            (current) =>
              current + reward
          );
        }

        localStorage.setItem(
          PASSIVE_TIMESTAMP_KEY,
          String(now)
        );
      }, 5000);

    return () =>
      window.clearInterval(
        timer
      );
  }, [passivePerMinute]);

  const showRewardedAd = async () => {
    if (energy > 10 || adLoading) {
      return;
    }

    setAdError("");
    setAdLoading(true);

    const grantAdReward = () => {
      const rewardedEnergy =
        Math.min(
          maxEnergy,
          ADSGRAM_REWARD_ENERGY
        );

      setEnergy(rewardedEnergy);
      setComfort(
        (current) =>
          current +
          ADSGRAM_REWARD_COMFORT
      );

      const now = Date.now();

      localStorage.setItem(
        ENERGY_STORAGE_KEY,
        String(rewardedEnergy)
      );

      localStorage.setItem(
        ENERGY_TIMESTAMP_KEY,
        String(now)
      );
    };

    try {
      /* -----------------------------------------------
         1. MONETAG — PRIMARY NETWORK
      ----------------------------------------------- */
      const monetagShow =
        (window as MonetagWindow)
          .show_11689364;

      if (
        typeof monetagShow ===
        "function"
      ) {
        try {
          await monetagShow();
          grantAdReward();
          return;
        } catch (monetagError) {
          console.warn(
            "Monetag rewarded ad unavailable, trying AdsGram:",
            monetagError
          );
        }
      } else {
        console.warn(
          "Monetag SDK is not ready, trying AdsGram."
        );
      }

      /* -----------------------------------------------
         2. ADSGRAM — FALLBACK NETWORK
      ----------------------------------------------- */
      let controller =
        adsgramControllerRef.current;

      if (!controller) {
        const adsgram =
          (window as AdsgramWindow).Adsgram;

        if (adsgram) {
          controller = adsgram.init({
            blockId: ADSGRAM_REWARD_BLOCK_ID,
            debug: false,
          });

          adsgramControllerRef.current =
            controller;
        }
      }

      if (!controller) {
        throw new Error(
          "Neither Monetag nor AdsGram is available"
        );
      }

      const result =
        await controller.show();

      if (!result.done || result.error) {
        throw new Error(
          result.description ||
            "AdsGram ad was not completed"
        );
      }

      grantAdReward();
    } catch (error) {
      console.error(
        "Rewarded ad error:",
        error
      );

      setAdError(
        language === "en"
          ? "Ad is unavailable right now. Please try again later."
          : language === "ua"
          ? "Реклама зараз недоступна. Спробуй пізніше."
          : "Реклама сейчас недоступна. Попробуй позже."
      );
    } finally {
      setAdLoading(false);
    }
  };

  /* ===================================================
     TAP
  =================================================== */

  const petCat = () => {
    if (
      energy <= 0
    ) {
      return;
    }

    const now =
      Date.now();

    if (
      energy >=
      maxEnergy
    ) {
      localStorage.setItem(
        ENERGY_TIMESTAMP_KEY,
        String(now)
      );
    }

    setEnergy(
      (value) =>
        Math.max(
          0,
          value - 1
        )
    );

    setComfort(
      (value) =>
        value + tapReward
    );

    setPetCount(
      (value) => value + 1
    );

    setDailyPetCount(
      (value) => value + 1
    );

    setRewardValue(
      tapReward
    );

    setTapAnimation(
      (value) => value + 1
    );

    setShowReward(
      true
    );

    window.setTimeout(() => {
      setShowReward(
        false
      );
    }, 650);
  };

  /* ===================================================
     BUY UPGRADE
  =================================================== */

  const buyUpgrade = (
    upgrade: Upgrade
  ) => {
    if (
      purchased.includes(
        upgrade.id
      )
    ) {
      return;
    }

    if (
      comfort <
      upgrade.cost
    ) {
      return;
    }

    setComfort(
      (value) =>
        Math.max(
          0,
          value -
            upgrade.cost
        )
    );

    setPurchased(
      (items) => [
        ...items,
        upgrade.id,
      ]
    );

    if (
      upgrade.passiveBonus >
      0
    ) {
      localStorage.setItem(
        PASSIVE_TIMESTAMP_KEY,
        String(
          Date.now()
        )
      );
    }
  };

  /* ===================================================
     BUY BACKGROUND
  =================================================== */

  const buyBackground = (
    background: Background
  ) => {
    if (
      background.id ===
      "background-0"
    ) {
      setSelectedBackground(
        "background-0"
      );

      if (
        !purchasedBackgrounds.includes(
          "background-0"
        )
      ) {
        setPurchasedBackgrounds(
          (items) => [
            ...items,
            "background-0",
          ]
        );
      }

      return;
    }

    if (
      purchasedBackgrounds.includes(
        background.id
      )
    ) {
      setSelectedBackground(
        background.id
      );

      return;
    }

    if (
      comfort <
      background.cost
    ) {
      return;
    }

    setComfort(
      (value) =>
        Math.max(
          0,
          value -
            background.cost
        )
    );

    setPurchasedBackgrounds(
      (items) => [
        ...items,
        background.id,
      ]
    );

    setSelectedBackground(
      background.id
    );
  };

  /* ===================================================
     START GAME
  =================================================== */

  const startGame = () => {
    const cleanName =
      nameInput.trim();

    if (!cleanName) {
      return;
    }

    setPetName(
      cleanName
    );

    setGameStarted(
      true
    );

    const storedEnergy =
      getStoredNumber(
        ENERGY_STORAGE_KEY,
        MAX_ENERGY
      );

    const storedTimestamp =
      getStoredNumber(
        ENERGY_TIMESTAMP_KEY,
        Date.now()
      );

    const result =
      calculateOfflineEnergy(
        storedEnergy,
        storedTimestamp
      );

    setEnergy(
      result.energy
    );

    localStorage.setItem(
      ENERGY_STORAGE_KEY,
      String(
        result.energy
      )
    );

    localStorage.setItem(
      ENERGY_TIMESTAMP_KEY,
      String(
        result.timestamp
      )
    );
  };

  /* ===================================================
     TASKS
  =================================================== */

  const claimDaily = () => {
    if (!dailyAvailable) {
      return;
    }

    setComfort(
      (value) => value + DAILY_REWARD
    );
    setDailyAvailable(false);
  };

  const claimDailyPet200 = () => {
    if (
      dailyPetCount < DAILY_PET_200_GOAL ||
      dailyPet200Claimed
    ) {
      return;
    }

    setComfort(
      (value) =>
        value + DAILY_PET_200_REWARD
    );
    setDailyPet200Claimed(true);
  };

  const claimDailyPet500 = () => {
    if (
      dailyPetCount < DAILY_PET_500_GOAL ||
      dailyPet500Claimed
    ) {
      return;
    }

    setComfort(
      (value) =>
        value + DAILY_PET_500_REWARD
    );
    setDailyPet500Claimed(true);
  };

  const claimOneTimePet1000 = () => {
    if (
      petCount < ONE_TIME_PET_1000_GOAL ||
      oneTimePet1000Claimed
    ) {
      return;
    }

    setComfort(
      (value) =>
        value + ONE_TIME_PET_1000_REWARD
    );
    setOneTimePet1000Claimed(true);
  };


  const claimOneTimePet5000 = () => {
    if (petCount < ONE_TIME_PET_5000_GOAL || oneTimePet5000Claimed) return;
    setComfort((value) => value + ONE_TIME_PET_5000_REWARD);
    setOneTimePet5000Claimed(true);
  };

  const claimOneTimePet10000 = () => {
    if (petCount < ONE_TIME_PET_10000_GOAL || oneTimePet10000Claimed) return;
    setComfort((value) => value + ONE_TIME_PET_10000_REWARD);
    setOneTimePet10000Claimed(true);
  };

  const claimOneTimeFriend1 = () => {
    if (friendCount < ONE_TIME_FRIEND_1_GOAL || oneTimeFriend1Claimed) return;
    setComfort((value) => value + ONE_TIME_FRIEND_1_REWARD);
    setOneTimeFriend1Claimed(true);
  };

  const claimOneTimeFriend5 = () => {
    if (friendCount < ONE_TIME_FRIEND_5_GOAL || oneTimeFriend5Claimed) return;
    setComfort((value) => value + ONE_TIME_FRIEND_5_REWARD);
    setOneTimeFriend5Claimed(true);
  };

  const claimOneTimeFriend10 = () => {
    if (friendCount < ONE_TIME_FRIEND_10_GOAL || oneTimeFriend10Claimed) return;
    setComfort((value) => value + ONE_TIME_FRIEND_10_REWARD);
    setOneTimeFriend10Claimed(true);
  };

  const claimReferralReward = async (
  taskKey:
    | "referral_1"
    | "referral_3"
    | "referral_5"
    | "referral_10"
) => {
  const { data, error } =
    await supabase.rpc(
      "claim_referral_reward",
      {
        requested_task_key:
          taskKey,
      }
    );

  if (error) {
    console.error(
      "TrustyPaws referral reward error:",
      error
    );
    return;
  }

  if (!data?.success) {
    console.log(
      "TrustyPaws referral reward rejected:",
      data
    );
    return;
  }

  if (
    typeof data.comfort === "number"
  ) {
    setComfort(data.comfort);
  }

  if (taskKey === "referral_1") {
    setReferral1Claimed(true);
  }

  if (taskKey === "referral_3") {
    setReferral3Claimed(true);
  }

  if (taskKey === "referral_5") {
    setReferral5Claimed(true);
  }

  if (taskKey === "referral_10") {
    setReferral10Claimed(true);
  }
};

const claimReferral1 = () => {
  void claimReferralReward(
    "referral_1"
  );
};

const claimReferral3 = () => {
  void claimReferralReward(
    "referral_3"
  );
};

const claimReferral5 = () => {
  void claimReferralReward(
    "referral_5"
  );
};

const claimReferral10 = () => {
  void claimReferralReward(
    "referral_10"
  );
};

  const buyComfortPet = (pet: Pet) => {
    if (
      pet.rarity !== "common" ||
      purchasedPets.includes(pet.id) ||
      typeof pet.comfortCost !== "number" ||
      comfort < pet.comfortCost
    ) {
      return;
    }

    setComfort((value) =>
      Math.max(0, value - pet.comfortCost!)
    );

    setPurchasedPets((current) =>
      current.includes(pet.id)
        ? current
        : [...current, pet.id]
    );
  };

  const selectPet = (pet: Pet) => {
    if (!purchasedPets.includes(pet.id)) {
      return;
    }

    setSelectedPet(pet.id);
  };

  const selectedPetData =
    PETS.find((pet) => pet.id === selectedPet) ?? PETS[0];

  /* ===================================================
     RESET
  =================================================== */

  const resetProgress =
    () => {
      const savedLanguage = language;

      localStorage.clear();

      const now =
        Date.now();

      setComfort(0);
      setEnergy(
        maxEnergy
      );
      setPetCount(0);

      setPurchased([]);
      setPurchasedPets(["default"]);
      setSelectedPet("default");

      setPurchasedBackgrounds(
        ["background-0"]
      );

      setSelectedBackground(
        "background-0"
      );

      setDailyAvailable(true);
      setDailyPetCount(0);
      setDailyPet200Claimed(false);
      setDailyPet500Claimed(false);
      setOneTimePet1000Claimed(false);
      setOneTimePet5000Claimed(false);
      setOneTimePet10000Claimed(false);
      setOneTimeFriend1Claimed(false);
      setOneTimeFriend5Claimed(false);
      setOneTimeFriend10Claimed(false);
      setFriendCount(0);
      setDailyResetAt(
        now + DAILY_RESET_MS
      );
      setTaskNow(now);

      setPetName("");
      setNameInput("");

      setGameStarted(
        false
      );

      setMenuOpen(
        false
      );

      setResetModalOpen(
        false
      );

      setActiveTab(
        "home"
      );

      setUpgradeSection(
        "items"
      );

      localStorage.setItem(
        ENERGY_STORAGE_KEY,
        String(
          MAX_ENERGY
        )
      );

      localStorage.setItem(
        ENERGY_TIMESTAMP_KEY,
        String(now)
      );

      localStorage.setItem(
        PASSIVE_TIMESTAMP_KEY,
        String(now)
      );

      localStorage.setItem(
        LANGUAGE_STORAGE_KEY,
        savedLanguage
      );

      localStorage.setItem(
        DAILY_RESET_AT_KEY,
        String(now + DAILY_RESET_MS)
      );
      localStorage.setItem(
        DAILY_PET_COUNT_KEY,
        "0"
      );
      localStorage.setItem(
        DAILY_PET_200_CLAIMED_KEY,
        "false"
      );
      localStorage.setItem(
        DAILY_PET_500_CLAIMED_KEY,
        "false"
      );
      localStorage.setItem(
        ONE_TIME_PET_1000_CLAIMED_KEY,
        "false"
      );
      localStorage.setItem(ONE_TIME_PET_5000_CLAIMED_KEY, "false");
      localStorage.setItem(ONE_TIME_PET_10000_CLAIMED_KEY, "false");
      localStorage.setItem(ONE_TIME_FRIEND_1_CLAIMED_KEY, "false");
      localStorage.setItem(ONE_TIME_FRIEND_5_CLAIMED_KEY, "false");
      localStorage.setItem(ONE_TIME_FRIEND_10_CLAIMED_KEY, "false");

      localStorage.setItem(
        "trusty_selected_background",
        "background-0"
      );

      localStorage.setItem(
        "trusty_backgrounds",
        JSON.stringify([
          "background-0",
        ])
      );
    };

  /* ===================================================
     FORMAT
  =================================================== */

  const formatNumber = (
    value: number
  ) => {
    const locale =
      language === "en"
        ? "en-US"
        : language === "ua"
        ? "uk-UA"
        : "ru-RU";

    return value.toLocaleString(
      locale,
      {
        maximumFractionDigits: 2,
      }
    );
  };

const formatTime = (
  seconds: number
) => {
  const safeSeconds =
    Math.max(
      0,
      Math.floor(seconds)
    );

  const hours =
    Math.floor(
      safeSeconds / 3600
    );

  const minutes =
    Math.floor(
      (safeSeconds % 3600) /
        60
    );

  const sec =
    safeSeconds % 60;

  return `${String(
    hours
  ).padStart(
    2,
    "0"
  )}:${String(
    minutes
  ).padStart(
    2,
    "0"
  )}:${String(
    sec
  ).padStart(
    2,
    "0"
  )}`;
};

  /* ===================================================
     INTRO
  =================================================== */

  if (!gameStarted) {
    return (
      <IntroScreen
        language={
          language
        }
        setLanguage={
          setLanguage
        }
        t={t}
        nameInput={
          nameInput
        }
        setNameInput={
          setNameInput
        }
        onStart={
          startGame
        }
      />
    );
  }
  return (
    <div className="app">

      <style>{`
        .daily-gift-box {
          position: absolute;
          top: 12px;
          left: 12px;
          z-index: 18;
          width: min(184px, calc(100% - 24px));
          min-height: 58px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 9px;
          border: 1px solid rgba(255, 255, 255, 0.28);
          border-radius: 16px;
          background: rgba(20, 24, 28, 0.78);
          color: #fff;
          text-align: left;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          cursor: pointer;
          transition:
            transform 160ms ease,
            opacity 160ms ease,
            border-color 160ms ease;
        }

        .daily-gift-box:disabled {
          cursor: default;
          opacity: 0.82;
        }

        .daily-gift-ready {
          border-color: rgba(255, 224, 120, 0.9);
          box-shadow:
            0 8px 24px rgba(0, 0, 0, 0.24),
            0 0 18px rgba(255, 215, 95, 0.28);
          animation: trustyGiftPulse 1.8s ease-in-out infinite;
        }

        .daily-gift-icon {
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          width: 42px;
          height: 42px;
          font-size: 30px;
          filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.25));
        }

        .daily-gift-ready .daily-gift-icon {
          animation: trustyGiftWiggle 2s ease-in-out infinite;
        }

        .daily-gift-copy {
          min-width: 0;
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 2px;
        }

        .daily-gift-copy strong {
          overflow: hidden;
          font-size: 11px;
          line-height: 1.2;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .daily-gift-copy small {
          font-size: 9px;
          line-height: 1.2;
          opacity: 0.76;
        }

        .daily-gift-open-label {
          flex: 0 0 auto;
          padding: 5px 7px;
          border-radius: 8px;
          background: rgba(255, 215, 84, 0.94);
          color: #332400;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.04em;
        }

        .daily-gift-error {
          position: absolute;
          top: 76px;
          left: 12px;
          z-index: 19;
          max-width: 190px;
          padding: 6px 8px;
          border-radius: 10px;
          background: rgba(88, 22, 22, 0.88);
          color: #fff;
          font-size: 9px;
          line-height: 1.25;
        }

        .gift-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: grid;
          place-items: center;
          padding: 20px;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .gift-modal {
          width: min(360px, 100%);
          padding: 28px 22px 22px;
          border: 1px solid rgba(255, 230, 155, 0.5);
          border-radius: 26px;
          background:
            radial-gradient(circle at top, rgba(255, 222, 122, 0.18), transparent 38%),
            #16191d;
          color: #fff;
          text-align: center;
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.52);
          animation: trustyGiftModalIn 220ms ease-out;
        }

        .gift-modal-sparkles {
          margin-bottom: 8px;
          font-size: 24px;
          letter-spacing: 5px;
        }

        .gift-modal-eyebrow {
          display: block;
          margin-bottom: 12px;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.14em;
          opacity: 0.62;
        }

        .gift-modal-prize-icon {
          display: grid;
          place-items: center;
          width: 82px;
          height: 82px;
          margin: 0 auto 12px;
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.08);
          font-size: 44px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
        }

        .gift-modal h2 {
          margin: 0 0 10px;
          font-size: 24px;
          line-height: 1.15;
        }

        .gift-rarity {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 28px;
          padding: 5px 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          font-size: 11px;
          font-weight: 800;
        }

        .gift-rarity-rare {
          box-shadow: inset 0 0 0 1px rgba(255, 220, 115, 0.25);
        }

        .gift-rarity-legendary {
          box-shadow:
            inset 0 0 0 1px rgba(255, 220, 115, 0.5),
            0 0 22px rgba(255, 208, 65, 0.18);
        }

        .gift-vip-bonus {
          margin-top: 10px;
          font-size: 11px;
          font-weight: 800;
          opacity: 0.82;
        }

        .gift-modal-close {
          width: 100%;
          min-height: 48px;
          margin-top: 18px;
          border: 0;
          border-radius: 15px;
          background: linear-gradient(135deg, #f4cb67, #f0a936);
          color: #2c1d00;
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
        }

        @keyframes trustyGiftPulse {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-2px) scale(1.015); }
        }

        @keyframes trustyGiftWiggle {
          0%, 70%, 100% { transform: rotate(0deg); }
          76% { transform: rotate(-7deg); }
          82% { transform: rotate(7deg); }
          88% { transform: rotate(-4deg); }
          94% { transform: rotate(4deg); }
        }

        @keyframes trustyGiftModalIn {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @media (max-width: 430px) {
          .daily-gift-box {
            width: 150px;
            min-height: 52px;
            padding: 6px 7px;
          }

          .daily-gift-icon {
            width: 34px;
            height: 34px;
            font-size: 25px;
          }

          .daily-gift-copy strong {
            font-size: 9px;
          }

          .daily-gift-copy small {
            font-size: 8px;
          }

          .daily-gift-open-label {
            display: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .daily-gift-ready,
          .daily-gift-ready .daily-gift-icon,
          .gift-modal {
            animation: none;
          }
        }
      `}</style>

      <div className="game-shell">

        {/* TOP BAR */}

        <header className="topbar">

          <button
            className="brand"
            type="button"
            onClick={() =>
              setActiveTab(
                "home"
              )
            }
          >
            <span className="brand-mark">
              🐾
            </span>

            <span className="brand-name">
              <strong>
                Trusty
              </strong>

              <em>
                Paws
              </em>
            </span>
          </button>

          <div className="topbar-balance">
            <span>
              🐾
            </span>

            <strong>
              {formatNumber(
                comfort
              )}
            </strong>
          </div>

          <button
            className={`menu-button ${
              menuOpen
                ? "menu-open"
                : ""
            }`}
            type="button"
            aria-label={
              t.settings
            }
            onClick={() =>
              setMenuOpen(
                (value) =>
                  !value
              )
            }
          >
            <span />
            <span />
            <span />
          </button>

          {menuOpen && (
            <div className="settings-menu">

              <div className="settings-menu-title">
                <span>
                  ⚙️
                </span>

                {t.settings}
              </div>

              {/* LANGUAGE */}

              <div className="language-settings">

                <div className="language-settings-header">

                  <div className="language-globe">
                    🌐
                  </div>

                  <div className="language-info">
                    <strong>
                      {t.language}
                    </strong>

                    <small>
                      {language === "ru"
                        ? "Русский"
                        : language === "ua"
                        ? "Українська"
                        : "English"}
                    </small>
                  </div>

                </div>

                <div className="language-buttons">

                  <button
                    type="button"
                    className={
                      language === "ru"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setLanguage("ru")
                    }
                    aria-label="Русский"
                  >
                    <span className="language-flag">
                      🇷🇺
                    </span>
                    <span className="language-code">
                      RU
                    </span>
                  </button>

                  <button
                    type="button"
                    className={
                      language === "ua"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setLanguage("ua")
                    }
                    aria-label="Українська"
                  >
                    <span className="language-flag">
                      🇺🇦
                    </span>
                    <span className="language-code">
                      UA
                    </span>
                  </button>

                  <button
                    type="button"
                    className={
                      language === "en"
                        ? "active"
                        : ""
                    }
                    onClick={() =>
                      setLanguage("en")
                    }
                    aria-label="English"
                  >
                    <span className="language-flag">
                      🇬🇧
                    </span>
                    <span className="language-code">
                      EN
                    </span>
                  </button>

                </div>

              </div>

              <button
                type="button"
                className="reset-menu-button"
                onClick={() => {
                  setMenuOpen(
                    false
                  );

                  setResetModalOpen(
                    true
                  );
                }}
              >
                <span className="reset-menu-icon">
                  ↻
                </span>

                <span>
                  <strong>
                    {
                      t.resetProgress
                    }
                  </strong>

                  <small>
                    {
                      t.restartGame
                    }
                  </small>
                </span>
              </button>

            </div>
          )}

        </header>

        {/* MAIN */}

        <main className="main-content">

          {activeTab ===
            "home" && (
            <HomeScreen
              t={t}
              petName={
                petName
              }
              comfort={
                comfort
              }
              energy={
                energy
              }
              maxEnergy={
                maxEnergy
              }
              petCount={
                petCount
              }
              tapReward={
                tapReward
              }
              passivePerMinute={
                passivePerMinute
              }
              purchased={
                purchased
              }
              selectedBackground={
                selectedBackground
              }
              selectedPetImage={
                selectedPetData.image
              }
              tapAnimation={
                tapAnimation
              }
              rewardValue={
                rewardValue
              }
              showReward={
                showReward
              }
              onPet={
                petCat
              }
              formatNumber={
                formatNumber
              }
              language={
                language
              }
              giftBoxAvailable={
                giftBoxAvailable
              }
              giftBoxLoaded={
                giftBoxLoaded
              }
              giftBoxOpening={
                giftBoxOpening
              }
              giftBoxCooldownText={
                formatGiftCountdown(
                  giftBoxSecondsLeft
                )
              }
              giftBoxError={
                giftBoxError
              }
              onOpenGiftBox={() =>
                void openGiftBox()
              }
              adLoading={
                adLoading
              }
              adError={
                adError
              }
              onWatchAd={() =>
                void showRewardedAd()
              }
            />
          )}

          {activeTab ===
            "upgrades" && (
            <UpgradesScreen
              t={t}
              section={
                upgradeSection
              }
              setSection={
                setUpgradeSection
              }
              comfort={
                comfort
              }
              tapReward={
                tapReward
              }
              passivePerMinute={
                passivePerMinute
              }
              purchased={
                purchased
              }
              purchasedBackgrounds={
                purchasedBackgrounds
              }
              selectedBackground={
                selectedBackground
              }
              onBuy={
                buyUpgrade
              }
              onBuyBackground={
                buyBackground
              }
              formatNumber={
                formatNumber
              }
            />
          )}

          {activeTab ===
            "tasks" && (
            <TasksScreen
              t={t}
              language={language}
              dailyAvailable={dailyAvailable}
              dailyPetCount={dailyPetCount}
              dailyPet200Claimed={dailyPet200Claimed}
              dailyPet500Claimed={dailyPet500Claimed}
              totalPetCount={petCount}
              oneTimePet1000Claimed={oneTimePet1000Claimed}
              oneTimePet5000Claimed={oneTimePet5000Claimed}
              oneTimePet10000Claimed={oneTimePet10000Claimed}
              oneTimeFriend1Claimed={oneTimeFriend1Claimed}
              oneTimeFriend5Claimed={oneTimeFriend5Claimed}
              oneTimeFriend10Claimed={oneTimeFriend10Claimed}
              friendCount={friendCount}
              
              referralCount={referralCount}

              referral1Claimed={referral1Claimed}
              referral3Claimed={referral3Claimed}
              referral5Claimed={referral5Claimed}
              referral10Claimed={referral10Claimed}

              secondsUntilReset={Math.max(
                0,
                Math.ceil(
                  (dailyResetAt - taskNow) / 1000
                )
              )}
              onClaimDaily={claimDaily}
              onClaimDailyPet200={claimDailyPet200}
              onClaimDailyPet500={claimDailyPet500}
              onClaimOneTimePet1000={claimOneTimePet1000}
              onClaimOneTimePet5000={claimOneTimePet5000}
              onClaimOneTimePet10000={claimOneTimePet10000}
              onClaimOneTimeFriend1={claimOneTimeFriend1}
              onClaimOneTimeFriend5={claimOneTimeFriend5}
              onClaimOneTimeFriend10={claimOneTimeFriend10}
              onClaimReferral1={claimReferral1}
              onClaimReferral3={claimReferral3}
              onClaimReferral5={claimReferral5}
              onClaimReferral10={claimReferral10}
              formatTime={formatTime}
            />
          )}

          {activeTab ===
            "friends" && (
            <FriendsScreen
              t={t}
              language={language}
              userId={userId}
              supabaseReady={supabaseReady}
              supabaseError={supabaseError}
              onRetrySupabase={() =>
                setSupabaseAttempt((value) => value + 1)
              }
              formatNumber={formatNumber}
            />
          )}

          {activeTab ===
            "shop" && (
            <ShopScreen
              t={t}
              language={language}
              userId={userId}
              comfort={comfort}
              purchasedPets={purchasedPets}
              selectedPet={selectedPet}
              onBuyComfortPet={buyComfortPet}
              onSelectPet={selectPet}
              onPurchasedPetsChange={setPurchasedPets}
              formatNumber={formatNumber}
              supabaseReady={
                supabaseReady
              }
              onVipStatusChange={(active, expiresAt) => {
                setVipActive(active);
                setVipExpiresAt(expiresAt);
              }}
            />
          )}

        </main>

        {/* BOTTOM NAV */}

        <BottomNavigation
          t={t}
          activeTab={
            activeTab
          }
          setActiveTab={
            setActiveTab
          }
          hasTaskReward={
              dailyAvailable ||
              (dailyPetCount >= DAILY_PET_200_GOAL &&
                !dailyPet200Claimed) ||
              (dailyPetCount >= DAILY_PET_500_GOAL &&
                !dailyPet500Claimed) ||
              (petCount >= ONE_TIME_PET_1000_GOAL && !oneTimePet1000Claimed) ||
              (petCount >= ONE_TIME_PET_5000_GOAL && !oneTimePet5000Claimed) ||
              (petCount >= ONE_TIME_PET_10000_GOAL && !oneTimePet10000Claimed) ||
              (friendCount >= ONE_TIME_FRIEND_1_GOAL && !oneTimeFriend1Claimed) ||
              (friendCount >= ONE_TIME_FRIEND_5_GOAL && !oneTimeFriend5Claimed) ||
              (friendCount >= ONE_TIME_FRIEND_10_GOAL && !oneTimeFriend10Claimed) ||
              (referralCount >= REFERRAL_1_GOAL && !referral1Claimed) ||
              (referralCount >= REFERRAL_3_GOAL && !referral3Claimed) ||
              (referralCount >= REFERRAL_5_GOAL && !referral5Claimed) ||
              (referralCount >= REFERRAL_10_GOAL && !referral10Claimed)
            }
        />

      </div>

      {/* DAILY GIFT MODAL */}

      {giftBoxPrize && (
        <div
          className="gift-modal-overlay"
          onClick={() =>
            setGiftBoxPrize(null)
          }
        >
          <div
            className="gift-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="gift-modal-sparkles">
              ✨ 🎁 ✨
            </div>

            <span className="gift-modal-eyebrow">
              {
                getGiftUi(language)
                  .rewardTitle
              }
            </span>

            <div className="gift-modal-prize-icon">
              {giftBoxPrize.kind === "comfort"
                ? "🐾"
                : "⚡"}
            </div>

            <h2>
              {giftBoxPrize.kind ===
              "full_energy"
                ? getGiftUi(language)
                    .fullEnergy
                : `+${
                    giftBoxPrize.amount
                  } ${
                    giftBoxPrize.kind ===
                    "comfort"
                      ? getGiftUi(language)
                          .comfort
                      : getGiftUi(language)
                          .energy
                  }`}
            </h2>

            <div
              className={`gift-rarity gift-rarity-${giftBoxPrize.rarity}`}
            >
              {
                getGiftUi(language)[
                  giftBoxPrize.rarity
                ]
              }
            </div>

            {vipActive &&
              giftBoxPrize.kind ===
                "comfort" && (
                <div className="gift-vip-bonus">
                  👑{" "}
                  {
                    getGiftUi(language)
                      .vipBonus
                  }
                </div>
              )}

            <button
              type="button"
              className="gift-modal-close"
              onClick={() =>
                setGiftBoxPrize(null)
              }
            >
              {
                getGiftUi(language)
                  .claim
              }
            </button>
          </div>
        </div>
      )}

      {/* RESET MODAL */}

      {resetModalOpen && (
        <div
          className="modal-overlay"
          onClick={() =>
            setResetModalOpen(
              false
            )
          }
        >
          <div
            className="reset-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="reset-modal-icon">
              ↻
            </div>

            <h2>
              {t.resetTitle}
            </h2>

            <p>
              {
                t.resetDescription
              }
            </p>

            <div className="reset-modal-actions">

              <button
                type="button"
                className="cancel-reset"
                onClick={() =>
                  setResetModalOpen(
                    false
                  )
                }
              >
                {t.cancel}
              </button>

              <button
                type="button"
                className="confirm-reset"
                onClick={
                  resetProgress
                }
              >
                {t.reset}
              </button>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}

/* =====================================================
   INTRO SCREEN
===================================================== */

function IntroScreen({
  language,
  setLanguage,
  t,
  nameInput,
  setNameInput,
  onStart,
}: {
  language: Language;
  setLanguage: (
    language: Language
  ) => void;
  t: Translation;
  nameInput: string;
  setNameInput: (
    value: string
  ) => void;
  onStart: () => void;
}) {
  return (
    <div className="intro-screen">

      <div className="intro-background" />

      <div className="intro-rain" />

      {/* LANGUAGE SWITCHER */}

      <div className="intro-language-switcher">

        <div className="intro-language-buttons">

          <button
            type="button"
            className={
              language === "ru"
                ? "active"
                : ""
            }
            onClick={() =>
              setLanguage("ru")
            }
            aria-label="Русский"
          >
            <span>🇷🇺</span>
            <b>RU</b>
          </button>

          <button
            type="button"
            className={
              language === "ua"
                ? "active"
                : ""
            }
            onClick={() =>
              setLanguage("ua")
            }
            aria-label="Українська"
          >
            <span>🇺🇦</span>
            <b>UA</b>
          </button>

          <button
            type="button"
            className={
              language === "en"
                ? "active"
                : ""
            }
            onClick={() =>
              setLanguage("en")
            }
            aria-label="English"
          >
            <span>🇬🇧</span>
            <b>EN</b>
          </button>

        </div>

      </div>

      <div className="intro-content">

        <div className="intro-logo">

          <span>
            🐾
          </span>

          <strong>
            TRUSTY
            <em>
              PAWS
            </em>
          </strong>

        </div>

        <div className="intro-cat-wrap">

          <div className="intro-cat-glow" />

          <img
            src={assetUrl("cat-3d.png")}
            alt="Pet"
            className="intro-cat"
            draggable="false"
          />

        </div>

        <div className="intro-copy">

          <span className="intro-eyebrow">
            {t.introEyebrow}
          </span>

          <h1>
            {t.introTitle}
          </h1>

          <p>
            {
              t.introDescription
            }
          </p>

        </div>

        <div className="name-form">

          <input
            value={
              nameInput
            }
            onChange={(event) =>
              setNameInput(
                event.target.value
              )
            }
            onKeyDown={(event) => {
              if (
                event.key ===
                "Enter"
              ) {
                onStart();
              }
            }}
            placeholder={
              t.petNamePlaceholder
            }
            maxLength={18}
          />

          <button
            type="button"
            onClick={
              onStart
            }
            disabled={
              !nameInput.trim()
            }
          >
            <span>
              {t.takePet}
            </span>

            <b>
              →
            </b>
          </button>

        </div>

        <small className="intro-note">
          {t.introNote}
        </small>

      </div>

    </div>
  );
}

/* =====================================================
   HOME
===================================================== */

function HomeScreen({
  t,
  petName,
  comfort,
  energy,
  maxEnergy,
  petCount,
  tapReward,
  passivePerMinute,
  purchased,
  selectedBackground,
  selectedPetImage,
  tapAnimation,
  rewardValue,
  showReward,
  onPet,
  formatNumber,
  language,
  giftBoxAvailable,
  giftBoxLoaded,
  giftBoxOpening,
  giftBoxCooldownText,
  giftBoxError,
  onOpenGiftBox,
  adLoading,
  adError,
  onWatchAd,
}: {
  t: Translation;
  petName: string;
  comfort: number;
  energy: number;
  maxEnergy: number;
  petCount: number;
  tapReward: number;
  passivePerMinute: number;
  purchased: string[];
  selectedBackground: string;
  selectedPetImage: string;
  tapAnimation: number;
  rewardValue: number;
  showReward: boolean;
  onPet: () => void;
  formatNumber: (
    value: number
  ) => string;
  language: Language;
  giftBoxAvailable: boolean;
  giftBoxLoaded: boolean;
  giftBoxOpening: boolean;
  giftBoxCooldownText: string;
  giftBoxError: string;
  onOpenGiftBox: () => void;
  adLoading: boolean;
  adError: string;
  onWatchAd: () => void;
}) {
  const energyPercent =
    Math.min(
      100,
      Math.max(
        0,
        (energy /
          maxEnergy) *
          100
      )
    );

  const hasBox =
    purchased.includes(
      "box"
    );

  const selectedBlanket =
    [
      ...ITEMS,
    ]
      .reverse()
      .find(
        (item) =>
          item.itemType ===
            "blanket" &&
          purchased.includes(
            item.id
          )
      );

  const selectedBowl =
    [
      ...ITEMS,
    ]
      .reverse()
      .find(
        (item) =>
          item.itemType ===
            "bowl" &&
          purchased.includes(
            item.id
          )
      );

  const highestHouse =
    useMemo(() => {
      const houses = [
        "villa",
        "house5",
        "house4",
        "house3",
        "house2",
        "house1",
      ];

      return houses.find(
        (id) =>
          purchased.includes(
            id
          )
      );
    }, [purchased]);

  const highestHouseData =
    highestHouse
      ? HOUSES.find(
          (item) =>
            item.id ===
            highestHouse
        )
      : undefined;

  const environmentLevel =
    purchased.length;

  return (
    <div className="page home-page">

      <section className="balance-card">

        <div className="balance-left">

          <div className="balance-paw">
            🐾
          </div>

          <div>

            <span className="eyebrow">
              {t.petComfort}
            </span>

            <div className="balance-value">
              {formatNumber(
                comfort
              )}
            </div>

            <span className="balance-unit">
              {t.comfort}
            </span>

          </div>

        </div>

        <div className="tap-income">

          <span>
            {t.perTap}
          </span>

          <strong>
            +
            {formatNumber(
              tapReward
            )}
          </strong>

        </div>

      </section>

      <section className="cat-card">

        <div className="cat-card-top">

          <div>

            <span className="eyebrow">
              {t.yourPet}
            </span>

            <h1>
              {petName}
            </h1>

            <p className="cat-condition">
              {environmentLevel ===
              0
                ? t.cold
                : environmentLevel <
                  3
                ? t.warmer
                : t.feelsHome}
            </p>

          </div>

          <div className="level-pill">

            <span>
              {t.lvl}
            </span>

            <strong>
              {1 +
                purchased.length}
            </strong>

          </div>

        </div>

        <div
          className={`cat-scene environment-${environmentLevel}`}
        >

          <img
            src={assetUrl(`background/${selectedBackground}.png`)}
            className="scene-background-image"
            alt=""
            draggable="false"
            onError={(event) => {
              const image =
                event.currentTarget;

              if (
                !image.dataset
                  .fallback
              ) {
                image.dataset.fallback =
                  "true";

                image.src =
                  assetUrl("background/background-0.png");
              }
            }}
          />

          <div className="scene-overlay" />

          <div className="scene-sky" />

          <div className="rain-layer">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>

          <div className="scene-ground-back" />

          <button
            type="button"
            className={`daily-gift-box ${
              giftBoxAvailable
                ? "daily-gift-ready"
                : ""
            }`}
            onClick={
              onOpenGiftBox
            }
            disabled={
              !giftBoxAvailable
            }
            aria-label={
              getGiftUi(language).title
            }
          >
            <span className="daily-gift-icon">
              🎁
            </span>

            <span className="daily-gift-copy">
              <strong>
                {
                  getGiftUi(language)
                    .title
                }
              </strong>

              <small>
                {!giftBoxLoaded
                  ? "..."
                  : giftBoxOpening
                  ? getGiftUi(language)
                      .opening
                  : giftBoxAvailable
                  ? getGiftUi(language)
                      .available
                  : `${getGiftUi(language).nextGift} ${giftBoxCooldownText}`}
              </small>
            </span>

            {giftBoxAvailable && (
              <span className="daily-gift-open-label">
                {
                  getGiftUi(language)
                    .open
                }
              </span>
            )}
          </button>

          {giftBoxError && (
            <div className="daily-gift-error">
              ⚠️ {giftBoxError}
            </div>
          )}

          {highestHouseData && (
            <img
              src={
                highestHouseData.sceneImage
              }
              className="scene-object scene-house"
              alt=""
              draggable="false"
            />
          )}

          {hasBox &&
            !highestHouse && (
            <img
              src={assetUrl("scene/box.png")}
              className="scene-object scene-box"
              alt=""
              draggable="false"
            />
          )}

          {selectedBlanket?.sceneImage && (
            <img
              src={
                selectedBlanket.sceneImage
              }
              className="scene-object scene-blanket"
              alt=""
              draggable="false"
            />
          )}

          {selectedBowl?.sceneImage && (
            <img
              src={
                selectedBowl.sceneImage
              }
              className="scene-object scene-bowl"
              alt=""
              draggable="false"
            />
          )}

          <div className="scene-ground" />

          <div className="scene-shadow" />

          <button
            type="button"
            className={`cat-button ${
              energy <= 0
                ? "disabled"
                : ""
            }`}
            onClick={
              onPet
            }
            disabled={
              energy <= 0
            }
            aria-label={
              t.tapCat
            }
          >

            <img
              src={selectedPetImage}
              alt={petName}
              className="cat-image"
              draggable="false"
            />

          </button>

          {showReward && (
            <div
              key={
                tapAnimation
              }
              className="floating-reward"
            >
              +
              {formatNumber(
                rewardValue
              )}
            </div>
          )}

          <div className="scene-condition">

            {environmentLevel ===
              0 && (
              <>
                <span>
                  ❤️
                </span>
                {t.catFeelsGood}
              </>
            )}

            {environmentLevel >
              0 &&
              environmentLevel <
                3 && (
                <>
                  <span>
                    🏠
                  </span>
                  {t.gettingCozy}
                </>
              )}

            {environmentLevel >=
              3 && (
              <>
                <span>
                  ❤️
                </span>
                {t.catFeelsGood}
              </>
            )}

          </div>

        </div>

        <div className="cat-hint">
          {energy > 0
            ? t.tapCat
            : t.waitEnergy}
        </div>

        <div className="energy-box">

          <div className="energy-top">

            <div className="energy-title">

              <span className="energy-symbol">
                ⚡
              </span>

              <div>

                <strong>
                  {t.energy}
                </strong>

                <small>
                  {energy <
                    maxEnergy
                    ? t.everyTwoSeconds
                    : t.fullyRestored}
                </small>

              </div>

            </div>

            <strong className="energy-count">
              {energy}/
              {maxEnergy}
            </strong>

          </div>

          <div className="energy-track">

            <div
              className="energy-progress"
              style={{
                width: `${energyPercent}%`,
              }}
            />

          </div>

        </div>

        {energy <= 10 && (
          <div
            style={{
              marginTop: "12px",
              padding: "14px",
              borderRadius: "18px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.10)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontWeight: 800,
                fontSize: "15px",
                marginBottom: "5px",
              }}
            >
              📺{" "}
              {language === "en"
                ? "Restore energy"
                : language === "ua"
                ? "Відновити енергію"
                : "Восстановить энергию"}
            </div>

            <div
              style={{
                fontSize: "12px",
                opacity: 0.72,
                marginBottom: "10px",
              }}
            >
              {language === "en"
                ? "Watch the ad to get +100 ⚡ Energy and +500 🐾 Comfort"
                : language === "ua"
                ? "Переглянь рекламу та отримай +100 ⚡ енергії і +500 🐾 затишку"
                : "Посмотри рекламу и получи +100 ⚡ энергии и +500 🐾 Комфорта"}
            </div>

            <button
              type="button"
              onClick={onWatchAd}
              disabled={adLoading}
              style={{
                width: "100%",
                border: 0,
                borderRadius: "14px",
                padding: "12px 14px",
                fontWeight: 800,
                cursor: adLoading
                  ? "default"
                  : "pointer",
              }}
            >
              {adLoading
                ? language === "en"
                  ? "Loading ad..."
                  : language === "ua"
                  ? "Завантаження реклами..."
                  : "Загрузка рекламы..."
                : language === "en"
                ? "📺 Watch ad"
                : language === "ua"
                ? "📺 Дивитися рекламу"
                : "📺 Смотреть рекламу"}
            </button>

            {adError && (
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "12px",
                  opacity: 0.8,
                }}
              >
                ⚠️ {adError}
              </div>
            )}
          </div>
        )}

      </section>

      <section className="stats-grid">

        <Stat
          icon="⚡"
          value={String(
            energy
          )}
          label={
            t.energy
          }
        />

        <Stat
          icon="🐾"
          value={formatNumber(
            petCount
          )}
          label={
            t.taps
          }
        />

        <Stat
          icon="✦"
          value={`+${formatNumber(
            tapReward
          )}`}
          label={
            t.perTapLabel
          }
        />

      </section>

      <section className="passive-card">

        <div className="passive-icon">
          ✦
        </div>

        <div className="passive-main">

          <span>
            {t.passiveComfort}
          </span>

          <strong>
            {passivePerMinute >
            0
              ? `+${formatNumber(
                  passivePerMinute
                )} ${t.minuteText}`
              : `0 ${t.minuteText}`}
          </strong>

          <small>
            {passivePerMinute >
            0
              ? t.passiveDescription
              : t.passiveLocked}
          </small>

        </div>

        <div
          className={`passive-status ${
            passivePerMinute >
            0
              ? ""
              : "passive-locked"
          }`}
        >

          <span />

          {passivePerMinute >
          0
            ? t.passiveWorks
            : t.passiveInactive}

        </div>

      </section>

    </div>
  );
}

/* =====================================================
   UPGRADES
===================================================== */

function UpgradesScreen({
  t,
  section,
  setSection,
  comfort,
  tapReward,
  passivePerMinute,
  purchased,
  purchasedBackgrounds,
  selectedBackground,
  onBuy,
  onBuyBackground,
  formatNumber,
}: {
  t: Translation;
  section: UpgradeSection;
  setSection: (
    section: UpgradeSection
  ) => void;
  comfort: number;
  tapReward: number;
  passivePerMinute: number;
  purchased: string[];
  purchasedBackgrounds: string[];
  selectedBackground: string;
  onBuy: (
    upgrade: Upgrade
  ) => void;
  onBuyBackground: (
    background: Background
  ) => void;
  formatNumber: (
    value: number
  ) => string;
}) {
  return (
    <div className="page">

      <PageHeader
        eyebrow={
          t.development
        }
        title={
          t.upgradesTitle
        }
        subtitle={
          t.upgradesSubtitle
        }
      />

      <section className="upgrade-income">

        <div className="upgrade-income-icon">
          ✦
        </div>

        <div>

          <span>
            {t.income}
          </span>

          <strong>
            +
            {formatNumber(
              tapReward
            )}{" "}
            {t.perTapText}
          </strong>

          <small>
            {passivePerMinute >
            0
              ? `+${formatNumber(
                  passivePerMinute
                )} ${t.passivePerMinute}`
              : t.passiveAfterHouse}
          </small>

        </div>

        <div className="upgrade-income-balance">
          🐾{" "}
          {formatNumber(
            comfort
          )}
        </div>

      </section>

      <div className="upgrade-tabs">

        <button
          type="button"
          className={
            section ===
            "items"
              ? "active"
              : ""
          }
          onClick={() =>
            setSection(
              "items"
            )
          }
        >
          <span>
            🧸
          </span>

          <strong>
            {t.items}
          </strong>
        </button>

        <button
          type="button"
          className={
            section ===
            "houses"
              ? "active"
              : ""
          }
          onClick={() =>
            setSection(
              "houses"
            )
          }
        >
          <span>
            🏠
          </span>

          <strong>
            {t.houses}
          </strong>
        </button>

        <button
          type="button"
          className={
            section ===
            "backgrounds"
              ? "active"
              : ""
          }
          onClick={() =>
            setSection(
              "backgrounds"
            )
          }
        >
          <span>
            🌄
          </span>

          <strong>
            {t.backgrounds}
          </strong>
        </button>

      </div>

      {section ===
        "items" && (
        <UpgradeList
          title={
            t.itemsUpper
          }
          items={
            ITEMS
          }
          purchased={
            purchased
          }
          comfort={
            comfort
          }
          onBuy={
            onBuy
          }
          formatNumber={
            formatNumber
          }
          t={t}
        />
      )}

      {section ===
        "houses" && (
        <UpgradeList
          title={
            t.housesUpper
          }
          items={
            HOUSES
          }
          purchased={
            purchased
          }
          comfort={
            comfort
          }
          onBuy={
            onBuy
          }
          formatNumber={
            formatNumber
          }
          t={t}
        />
      )}

      {section ===
        "backgrounds" && (
        <BackgroundList
          backgrounds={
            BACKGROUNDS
          }
          purchasedBackgrounds={
            purchasedBackgrounds
          }
          selectedBackground={
            selectedBackground
          }
          comfort={
            comfort
          }
          onBuy={
            onBuyBackground
          }
          formatNumber={
            formatNumber
          }
          t={t}
        />
      )}

    </div>
  );
}

/* =====================================================
   LOCALIZED UPGRADE DATA
===================================================== */

function getLocalizedUpgrade(
  upgrade: Upgrade,
  t: Translation
): Upgrade {
  const data: Record<
    string,
    {
      name: string;
      description: string;
    }
  > = {
    box: {
      name: t.boxName,
      description:
        t.boxDescription,
    },

    blanket: {
      name: t.blanket1,
      description:
        t.blanket1Description,
    },

    blanket2: {
      name: t.blanket2,
      description:
        t.blanket2Description,
    },

    blanket3: {
      name: t.blanket3,
      description:
        t.blanket3Description,
    },

    blanket4: {
      name: t.blanket4,
      description:
        t.blanket4Description,
    },

    bowl: {
      name: t.bowl1,
      description:
        t.bowl1Description,
    },

    bowl2: {
      name: t.bowl2,
      description:
        t.bowl2Description,
    },

    bowl3: {
      name: t.bowl3,
      description:
        t.bowl3Description,
    },

    bowl4: {
      name: t.bowl4,
      description:
        t.bowl4Description,
    },

    house1: {
      name: t.house1,
      description:
        t.house1Description,
    },

    house2: {
      name: t.house2,
      description:
        t.house2Description,
    },

    house3: {
      name: t.house3,
      description:
        t.house3Description,
    },

    house4: {
      name: t.house4,
      description:
        t.house4Description,
    },

    house5: {
      name: t.house5,
      description:
        t.house5Description,
    },

    villa: {
      name: t.villa,
      description:
        t.villaDescription,
    },
  };

  const localized =
    data[upgrade.id];

  if (!localized) {
    return upgrade;
  }

  return {
    ...upgrade,
    name:
      localized.name,
    description:
      localized.description,
  };
}

/* =====================================================
   UPGRADE LIST
===================================================== */

function UpgradeList({
  title,
  items,
  purchased,
  comfort,
  onBuy,
  formatNumber,
  t,
}: {
  title: string;
  items: Upgrade[];
  purchased: string[];
  comfort: number;
  onBuy: (
    upgrade: Upgrade
  ) => void;
  formatNumber: (
    value: number
  ) => string;
  t: Translation;
}) {
  return (
    <>
      <div className="list-title">

        <span>
          {title}
        </span>

        <b>
          {
            items.filter(
              (item) =>
                purchased.includes(
                  item.id
                )
            ).length
          }
          /
          {items.length}
        </b>

      </div>

      <div className="upgrade-list">

        {items.map(
          (originalUpgrade) => {
            const upgrade =
              getLocalizedUpgrade(
                originalUpgrade,
                t
              );

            const owned =
              purchased.includes(
                upgrade.id
              );

            const affordable =
              comfort >=
              upgrade.cost;

            return (
              <article
                className={`upgrade-card ${
                  owned
                    ? "owned"
                    : ""
                }`}
                key={
                  upgrade.id
                }
              >

                <div className="upgrade-icon">
                  {
                    upgrade.icon
                  }
                </div>

                <div className="upgrade-content">

                  <div className="upgrade-heading">

                    <h3>
                      {
                        upgrade.name
                      }
                    </h3>

                    {owned && (
                      <span className="owned-label">
                        {t.scene}
                      </span>
                    )}

                  </div>

                  <p>
                    {
                      upgrade.description
                    }
                  </p>

                  <div className="upgrade-bonus-row">

                    <span className="upgrade-bonus">
                      +
                      {formatNumber(
                        upgrade.tapBonus
                      )}{" "}
                      {t.perTapText}
                    </span>

                    <span className="passive-bonus">
                      +
                      {formatNumber(
                        upgrade.passiveBonus
                      )}
                      {t.minuteText}
                    </span>

                  </div>

                </div>

                {owned ? (
                  <div className="owned-check">
                    ✓
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`buy-button ${
                      !affordable
                        ? "locked"
                        : ""
                    }`}
                    disabled={
                      !affordable
                    }
                    onClick={() =>
                      onBuy(
                        upgrade
                      )
                    }
                  >
                    🐾{" "}
                    {formatNumber(
                      upgrade.cost
                    )}
                  </button>
                )}

              </article>
            );
          }
        )}

      </div>
    </>
  );
}

/* =====================================================
   LOCALIZED BACKGROUND
===================================================== */

function getLocalizedBackground(
  background: Background,
  t: Translation
): Background {
  const data: Record<
    string,
    {
      name: string;
      description: string;
    }
  > = {
    "background-0": {
      name: t.firstMeeting,
      description:
        t.firstMeetingDescription,
    },

    "background-1": {
      name: t.warmEvening,
      description:
        t.warmEveningDescription,
    },

    "background-2": {
      name: t.sunnyYard,
      description:
        t.sunnyYardDescription,
    },

    "background-3": {
      name: t.greenGarden,
      description:
        t.greenGardenDescription,
    },

    "background-4": {
      name: t.nightYard,
      description:
        t.nightYardDescription,
    },

    "background-5": {
      name: t.autumnPark,
      description:
        t.autumnParkDescription,
    },

    "background-6": {
      name: t.winterCozy,
      description:
        t.winterCozyDescription,
    },

    "background-7": {
      name: t.premiumYard,
      description:
        t.premiumYardDescription,
    },

    "background-8": {
      name: t.bigGarden,
      description:
        t.bigGardenDescription,
    },

    "background-9": {
      name: t.catParadise,
      description:
        t.catParadiseDescription,
    },
  };

  const localized =
    data[background.id];

  if (!localized) {
    return background;
  }

  return {
    ...background,
    name:
      localized.name,
    description:
      localized.description,
  };
}

/* =====================================================
   BACKGROUND LIST
===================================================== */

function BackgroundList({
  backgrounds,
  purchasedBackgrounds,
  selectedBackground,
  comfort,
  onBuy,
  formatNumber,
  t,
}: {
  backgrounds: Background[];
  purchasedBackgrounds: string[];
  selectedBackground: string;
  comfort: number;
  onBuy: (
    background: Background
  ) => void;
  formatNumber: (
    value: number
  ) => string;
  t: Translation;
}) {
  return (
    <>
      <div className="list-title">

        <span>
          {
            t.atmosphereUpper
          }
        </span>

        <b>
          {
            purchasedBackgrounds.length
          }
          /
          {backgrounds.length}
        </b>

      </div>

      <div className="background-grid">

        {backgrounds.map(
          (originalBackground) => {
            const background =
              getLocalizedBackground(
                originalBackground,
                t
              );

            const owned =
              purchasedBackgrounds.includes(
                background.id
              );

            const selected =
              selectedBackground ===
              background.id;

            const affordable =
              comfort >=
              background.cost;

            return (
              <article
                className={`background-card ${
                  selected
                    ? "selected"
                    : ""
                }`}
                key={
                  background.id
                }
              >

                <div className="background-preview">

                  <img
                    src={
                      background.image
                    }
                    alt=""
                    draggable="false"
                    onError={(event) => {
                      event.currentTarget.style.display =
                        "none";
                    }}
                  />

                  <div className="background-preview-overlay" />

                  {selected && (
                    <span className="background-selected">
                      {t.selected}
                    </span>
                  )}

                </div>

                <div className="background-info">

                  <div>

                    <h3>
                      {
                        background.name
                      }
                    </h3>

                    <p>
                      {
                        background.description
                      }
                    </p>

                  </div>

                  {owned ? (
                    <button
                      type="button"
                      className={`background-action ${
                        selected
                          ? "current"
                          : ""
                      }`}
                      onClick={() =>
                        onBuy(
                          background
                        )
                      }
                    >
                      {selected
                        ? t.using
                        : t.choose}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="background-action"
                      disabled={
                        !affordable
                      }
                      onClick={() =>
                        onBuy(
                          background
                        )
                      }
                    >
                      {background.cost ===
                      0
                        ? t.free
                        : `🐾 ${formatNumber(
                            background.cost
                          )}`}
                    </button>
                  )}

                </div>

              </article>
            );
          }
        )}

      </div>

      <div className="background-note">

        {t.backgroundNote}

      </div>
    </>
  );
}

/* =====================================================
   TASKS
===================================================== */

function TasksScreen({
  t,
  language,
  dailyAvailable,
  dailyPetCount,
  dailyPet200Claimed,
  dailyPet500Claimed,
  totalPetCount,
  oneTimePet1000Claimed,
  oneTimePet5000Claimed,
  oneTimePet10000Claimed,
  oneTimeFriend1Claimed,
  oneTimeFriend5Claimed,
  oneTimeFriend10Claimed,
  friendCount,
  referralCount,
  referral1Claimed,
  referral3Claimed,
  referral5Claimed,
  referral10Claimed,
  secondsUntilReset,
  onClaimDaily,
  onClaimDailyPet200,
  onClaimDailyPet500,
  onClaimOneTimePet1000,
  onClaimOneTimePet5000,
  onClaimOneTimePet10000,
  onClaimOneTimeFriend1,
  onClaimOneTimeFriend5,
  onClaimOneTimeFriend10,
  onClaimReferral1,
  onClaimReferral3,
  onClaimReferral5,
  onClaimReferral10,
  formatTime,
}: {
  t: Translation;
  language: Language;
  dailyAvailable: boolean;
  dailyPetCount: number;
  dailyPet200Claimed: boolean;
  dailyPet500Claimed: boolean;
  totalPetCount: number;
  oneTimePet1000Claimed: boolean;
  oneTimePet5000Claimed: boolean;
  oneTimePet10000Claimed: boolean;
  oneTimeFriend1Claimed: boolean;
  oneTimeFriend5Claimed: boolean;
  oneTimeFriend10Claimed: boolean;
  friendCount: number;
  referralCount: number;
  referral1Claimed: boolean;
  referral3Claimed: boolean;
  referral5Claimed: boolean;
  referral10Claimed: boolean;
  secondsUntilReset: number;
  onClaimDaily: () => void;
  onClaimDailyPet200: () => void;
  onClaimDailyPet500: () => void;
  onClaimOneTimePet1000: () => void;
  onClaimOneTimePet5000: () => void;
  onClaimOneTimePet10000: () => void;
  onClaimOneTimeFriend1: () => void;
  onClaimOneTimeFriend5: () => void;
  onClaimOneTimeFriend10: () => void;
  onClaimReferral1: () => void;
  onClaimReferral3: () => void;
  onClaimReferral5: () => void;
  onClaimReferral10: () => void;
  formatTime: (seconds: number) => string;
}) {
  const [taskSection, setTaskSection] = useState<"daily" | "oneTime">("daily");

  const text =
    language === "en"
      ? {
          daily: "Daily",
          oneTime: "One-time",
          resetIn: "Daily tasks refresh in",
          pet200: "Pet the kitty 200 times",
          pet500: "Pet the kitty 500 times",
          pet1000: "Pet the kitty 1,000 times",
          pet5000: "Pet the kitty 5,000 times",
          pet10000: "Pet the kitty 10,000 times",
          friend1: "Add 1 friend",
          friend5: "Add 5 friends",
          friend10: "Add 10 friends",
          referral1: "Invite 1 player",
          referral3: "Invite 3 players",
          referral5: "Invite 5 players",
          referral10: "Invite 10 players",
          referralMilestone:
           "Only confirmed referrals who reached 100 taps count.",
          love: "Pet your kitty during the current daily cycle.",
          milestone: "Permanent achievement. Claim the reward once after completing it.",
          friendMilestone: "Add accepted friends in TrustyPaws. Only accepted friendships count.",
        }
      : language === "ua"
      ? {
          daily: "Щоденні",
          oneTime: "Одноразові",
          resetIn: "Щоденні завдання оновляться через",
          pet200: "Погладь котика 200 разів",
          pet500: "Погладь котика 500 разів",
          pet1000: "Погладь котика 1 000 разів",
          pet5000: "Погладь котика 5 000 разів",
          pet10000: "Погладь котика 10 000 разів",
          friend1: "Додай 1 друга",
          friend5: "Додай 5 друзів",
          friend10: "Додай 10 друзів",
          referral1: "Запроси 1 гравця",
          referral3: "Запроси 3 гравців",
          referral5: "Запроси 5 гравців",
          referral10: "Запроси 10 гравців",
          referralMilestone:
           "Враховуються лише підтверджені реферали, які зробили 100 натискань.",
          love: "Гладь котика протягом поточного щоденного циклу.",
          milestone: "Постійне досягнення. Після виконання нагороду можна забрати один раз.",
          friendMilestone: "Додавай прийнятих друзів у TrustyPaws. Враховуються лише прийняті дружби.",
        }
      : {
          daily: "Ежедневные",
          oneTime: "Одноразовые",
          resetIn: "Ежедневные задания обновятся через",
          pet200: "Погладь котика 200 раз",
          pet500: "Погладь котика 500 раз",
          pet1000: "Погладь котика 1 000 раз",
          pet5000: "Погладь котика 5 000 раз",
          pet10000: "Погладь котика 10 000 раз",
          friend1: "Добавь 1 друга",
          friend5: "Добавь 5 друзей",
          friend10: "Добавь 10 друзей",
          referral1: "Пригласи 1 игрока",
          referral3: "Пригласи 3 игроков",
          referral5: "Пригласи 5 игроков",
          referral10: "Пригласи 10 игроков",
          referralMilestone:
           "Учитываются только подтверждённые рефералы, которые сделали 100 нажатий.",
          love: "Гладь котика в течение текущего ежедневного цикла.",
          milestone: "Постоянное достижение. После выполнения награду можно забрать один раз.",
          friendMilestone: "Добавляй принятых друзей в TrustyPaws. Учитываются только принятые дружбы.",
        };

  const dailyClaimed =
    Number(!dailyAvailable) +
    Number(dailyPet200Claimed) +
    Number(dailyPet500Claimed);

  const oneTimeClaimed =
    Number(oneTimePet1000Claimed) +
    Number(oneTimePet5000Claimed) +
    Number(oneTimePet10000Claimed) +
    Number(oneTimeFriend1Claimed) +
    Number(oneTimeFriend5Claimed) +
    Number(oneTimeFriend10Claimed) +
    Number(referral1Claimed) +
    Number(referral3Claimed) +
    Number(referral5Claimed) +
    Number(referral10Claimed);

  const achievementCard = (
    icon: string,
    title: string,
    description: string,
    current: number,
    goal: number,
    reward: number,
    completed: boolean,
    onClaim: () => void
  ) => (
    <TaskCard
      t={t}
      icon={icon}
      title={title}
      description={description}
      progress={Math.min(100, (current / goal) * 100)}
      progressText={
        completed
          ? t.taskCompleted
          : `${Math.min(current, goal)} / ${goal}`
      }
      reward={reward}
      completed={completed}
      available={current >= goal && !completed}
      onClaim={onClaim}
    />
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow={t.rewards}
        title={t.tasks}
        subtitle={t.tasksSubtitle}
        badge={taskSection === "daily" ? `${dailyClaimed}/3` : `${oneTimeClaimed}/6`}
      />

      <div className="upgrade-tabs" style={{ marginBottom: "14px" }}>
        <button
          type="button"
          className={taskSection === "daily" ? "active" : ""}
          onClick={() => setTaskSection("daily")}
        >
          {text.daily}
        </button>
        <button
          type="button"
          className={taskSection === "oneTime" ? "active" : ""}
          onClick={() => setTaskSection("oneTime")}
        >
          {text.oneTime}
        </button>
      </div>

      {taskSection === "daily" ? (
        <>
          <div
            style={{
              marginBottom: "14px",
              padding: "14px 16px",
              borderRadius: "16px",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.08)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "13px", opacity: 0.68, marginBottom: "5px" }}>
              {text.resetIn}
            </div>
            <div style={{ fontSize: "20px", fontWeight: 800 }}>
              {formatTime(secondsUntilReset)}
            </div>
          </div>

          <section className="daily-bonus">
            <div className="daily-icon">🎁</div>
            <div className="daily-content">
              <span>{t.dailyBonus}</span>
              <h3>{t.everyDay}</h3>
              <p>{t.dailyDescription}</p>
            </div>
            <div className="daily-action">
              <strong>+{DAILY_REWARD}</strong>
              {dailyAvailable ? (
                <button type="button" onClick={onClaimDaily}>{t.claim}</button>
              ) : (
                <span className="claimed-text">{t.received}</span>
              )}
            </div>
          </section>

          <div className="list-title task-list-title">
            <span>{text.daily}</span><b>{dailyClaimed}/3</b>
          </div>

          {achievementCard("🐾", text.pet200, text.love, dailyPetCount, DAILY_PET_200_GOAL, DAILY_PET_200_REWARD, dailyPet200Claimed, onClaimDailyPet200)}
          {achievementCard("🐾", text.pet500, text.love, dailyPetCount, DAILY_PET_500_GOAL, DAILY_PET_500_REWARD, dailyPet500Claimed, onClaimDailyPet500)}
        </>
      ) : (
        <>
          <div className="list-title task-list-title">
            <span>{text.oneTime}</span><b>{oneTimeClaimed}/10</b>
          </div>

          {achievementCard("🏆", text.pet1000, text.milestone, totalPetCount, ONE_TIME_PET_1000_GOAL, ONE_TIME_PET_1000_REWARD, oneTimePet1000Claimed, onClaimOneTimePet1000)}
          {achievementCard("🏆", text.pet5000, text.milestone, totalPetCount, ONE_TIME_PET_5000_GOAL, ONE_TIME_PET_5000_REWARD, oneTimePet5000Claimed, onClaimOneTimePet5000)}
          {achievementCard("🏆", text.pet10000, text.milestone, totalPetCount, ONE_TIME_PET_10000_GOAL, ONE_TIME_PET_10000_REWARD, oneTimePet10000Claimed, onClaimOneTimePet10000)}
          {achievementCard("👥", text.friend1, text.friendMilestone, friendCount, ONE_TIME_FRIEND_1_GOAL, ONE_TIME_FRIEND_1_REWARD, oneTimeFriend1Claimed, onClaimOneTimeFriend1)}
          {achievementCard("👥", text.friend5, text.friendMilestone, friendCount, ONE_TIME_FRIEND_5_GOAL, ONE_TIME_FRIEND_5_REWARD, oneTimeFriend5Claimed, onClaimOneTimeFriend5)}
          {achievementCard("👥", text.friend10, text.friendMilestone, friendCount, ONE_TIME_FRIEND_10_GOAL, ONE_TIME_FRIEND_10_REWARD, oneTimeFriend10Claimed, onClaimOneTimeFriend10)}
          {achievementCard("🎁",text.referral1,text.referralMilestone,referralCount,REFERRAL_1_GOAL,REFERRAL_1_REWARD,referral1Claimed,onClaimReferral1)}
          {achievementCard("🎁",text.referral3,text.referralMilestone,referralCount,REFERRAL_3_GOAL,REFERRAL_3_REWARD,referral3Claimed,onClaimReferral3)}
          {achievementCard("🎁",text.referral5,text.referralMilestone,referralCount,REFERRAL_5_GOAL,REFERRAL_5_REWARD,referral5Claimed,onClaimReferral5)}
          {achievementCard("🎁",text.referral10,text.referralMilestone,referralCount,REFERRAL_10_GOAL,REFERRAL_10_REWARD,referral10Claimed,onClaimReferral10)}  
        </>
      )}
    </div>
  );
}

/* =====================================================
   FRIENDS + LEADERBOARD
===================================================== */

type FriendProfile = {
  id: string;
  username: string | null;
  telegram_username: string | null;
  telegram_name: string | null;
  pet_name: string;
  comfort: number;
  level: number;
  is_vip?: boolean | null;
};

type FriendRequestRow = {
  id: number;
  sender_id: string;
  receiver_id: string;
  status: "pending" | "accepted" | "declined";
  created_at: string;
};

type FriendshipRow = {
  id: number;
  user_id: string;
  friend_id: string;
  created_at: string;
};

type SocialSection = "friends" | "leaderboard";

const FRIEND_TEXT = {
  ru: {
    subtitle: "Находи игроков TrustyPaws и заботьтесь о питомцах вместе",
    friendsTab: "Друзья",
    leaderboardTab: "Рейтинг",
    leaderboardTitle: "РЕЙТИНГ ИГРОКОВ",
    leaderboardSubtitle: "Место определяется по общему количеству Уюта",
    leaderboardEmpty: "В рейтинге пока нет игроков",
    leaderboardError: "Не удалось загрузить рейтинг",
    yourPlace: "Твоё место",
    you: "Ты",
    refresh: "Обновить",
    yourId: "ТВОЙ ID ИГРОКА",
    copy: "Копировать",
    copied: "Скопировано",
    searchTitle: "НАЙТИ ИГРОКА",
    searchPlaceholder: "Например: TP-34AE8BCA",
    search: "Найти",
    searching: "Поиск...",
    add: "Добавить",
    requestSent: "Заявка отправлена",
    alreadyFriend: "Уже в друзьях",
    incoming: "ВХОДЯЩИЕ ЗАЯВКИ",
    noIncoming: "Новых заявок пока нет",
    accept: "Принять",
    decline: "Отклонить",
    myFriends: "МОИ ДРУЗЬЯ",
    noFriends: "У тебя пока нет друзей. Найди игрока по его ID выше.",
    remove: "Удалить",
    comfort: "Уют",
    level: "Уровень",
    pet: "Питомец",
    unknownPet: "Без имени",
    notFound: "Игрок с таким ID не найден",
    ownId: "Это твой собственный ID 🙂",
    loadError: "Не удалось загрузить друзей",
    actionError: "Не удалось выполнить действие",
    pending: "Заявка уже отправлена",
    incomingExists: "Этот игрок уже отправил тебе заявку — прими её ниже",
    connection: "Подключение к серверу...",
  },
  en: {
    subtitle: "Find TrustyPaws players and take care of your pets together",
    friendsTab: "Friends",
    leaderboardTab: "Ranking",
    leaderboardTitle: "PLAYER RANKING",
    leaderboardSubtitle: "Rank is based on total Comfort",
    leaderboardEmpty: "There are no players in the ranking yet",
    leaderboardError: "Couldn't load the ranking",
    yourPlace: "Your place",
    you: "You",
    refresh: "Refresh",
    yourId: "YOUR PLAYER ID",
    copy: "Copy",
    copied: "Copied",
    searchTitle: "FIND PLAYER",
    searchPlaceholder: "Example: TP-34AE8BCA",
    search: "Search",
    searching: "Searching...",
    add: "Add friend",
    requestSent: "Request sent",
    alreadyFriend: "Already friends",
    incoming: "INCOMING REQUESTS",
    noIncoming: "No new requests yet",
    accept: "Accept",
    decline: "Decline",
    myFriends: "MY FRIENDS",
    noFriends: "You don't have friends yet. Find a player by ID above.",
    remove: "Remove",
    comfort: "Comfort",
    level: "Level",
    pet: "Pet",
    unknownPet: "Unnamed",
    notFound: "Player with this ID was not found",
    ownId: "That's your own ID 🙂",
    loadError: "Couldn't load friends",
    actionError: "Couldn't complete the action",
    pending: "Request already sent",
    incomingExists: "This player already sent you a request — accept it below",
    connection: "Connecting to server...",
  },
  ua: {
    subtitle: "Знаходь гравців TrustyPaws і піклуйтеся про улюбленців разом",
    friendsTab: "Друзі",
    leaderboardTab: "Рейтинг",
    leaderboardTitle: "РЕЙТИНГ ГРАВЦІВ",
    leaderboardSubtitle: "Місце визначається за загальною кількістю Затишку",
    leaderboardEmpty: "У рейтингу поки немає гравців",
    leaderboardError: "Не вдалося завантажити рейтинг",
    yourPlace: "Твоє місце",
    you: "Ти",
    refresh: "Оновити",
    yourId: "ТВІЙ ID ГРАВЦЯ",
    copy: "Копіювати",
    copied: "Скопійовано",
    searchTitle: "ЗНАЙТИ ГРАВЦЯ",
    searchPlaceholder: "Наприклад: TP-34AE8BCA",
    search: "Знайти",
    searching: "Пошук...",
    add: "Додати",
    requestSent: "Заявку надіслано",
    alreadyFriend: "Вже у друзях",
    incoming: "ВХІДНІ ЗАЯВКИ",
    noIncoming: "Нових заявок поки немає",
    accept: "Прийняти",
    decline: "Відхилити",
    myFriends: "МОЇ ДРУЗІ",
    noFriends: "У тебе поки немає друзів. Знайди гравця за його ID вище.",
    remove: "Видалити",
    comfort: "Затишок",
    level: "Рівень",
    pet: "Улюбленець",
    unknownPet: "Без імені",
    notFound: "Гравця з таким ID не знайдено",
    ownId: "Це твій власний ID 🙂",
    loadError: "Не вдалося завантажити друзів",
    actionError: "Не вдалося виконати дію",
    pending: "Заявку вже надіслано",
    incomingExists: "Цей гравець уже надіслав тобі заявку — прийми її нижче",
    connection: "Підключення до сервера...",
  },
} as const;

function getPlayerDisplayName(profile: FriendProfile | null | undefined) {
  if (!profile) return "TrustyPaws";

  // Показываем в первую очередь обычное имя пользователя из Telegram.
  // Например: "Shinobi Silent".
  const telegramName = profile.telegram_name?.trim();
  if (telegramName) return telegramName;

  // Если Telegram-имя недоступно, используем @username.
  const telegramUsername = profile.telegram_username?.trim();
  if (telegramUsername) {
    return telegramUsername.startsWith("@")
      ? telegramUsername
      : `@${telegramUsername}`;
  }

  // Последний запасной вариант — внутренний TP-ID.
  return profile.username?.trim() || "TrustyPaws";
}

function FriendsScreen({
  t,
  language,
  userId,
  supabaseReady,
  supabaseError,
  onRetrySupabase,
  formatNumber,
}: {
  t: Translation;
  language: Language;
  userId: string | null;
  supabaseReady: boolean;
  supabaseError: string;
  onRetrySupabase: () => void;
  formatNumber: (value: number) => string;
}) {
  const ft = FRIEND_TEXT[language];

  const [socialSection, setSocialSection] =
    useState<SocialSection>("friends");
  const [searchValue, setSearchValue] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<FriendProfile | null>(null);
  const [searchMessage, setSearchMessage] = useState("");
  const [incomingRequests, setIncomingRequests] = useState<
    Array<FriendRequestRow & { profile: FriendProfile | null }>
  >([]);
  const [friends, setFriends] = useState<
    Array<FriendshipRow & { profile: FriendProfile | null }>
  >([]);
  const [friendRows, setFriendRows] = useState<FriendshipRow[]>([]);
  const [requestRows, setRequestRows] = useState<FriendRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const [referralCount, setReferralCount] = useState(0);
  const [referralLoading, setReferralLoading] = useState(false);
  const [errorText, setErrorText] = useState("");

  const [leaderboard, setLeaderboard] = useState<FriendProfile[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState("");

  const playerCode = useMemo(() => {
    if (!userId) return "TP-........";

    return `TP-${userId
      .replace(/-/g, "")
      .slice(0, 8)
      .toUpperCase()}`;
  }, [userId]);

  const referralLink = useMemo(() => {
  if (!userId) {
    return "";
  }

  return `https://t.me/TrustyPawsGameBot?startapp=ref_${playerCode}`;
  }, [userId, playerCode]);

  const loadFriendsData = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorText("");

    try {
      const [requestsResponse, friendshipsResponse] = await Promise.all([
        supabase
          .from("friend_requests")
          .select("id,sender_id,receiver_id,status,created_at")
          .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`),
        supabase
          .from("friendships")
          .select("id,user_id,friend_id,created_at")
          .or(`user_id.eq.${userId},friend_id.eq.${userId}`),
      ]);

      if (requestsResponse.error) throw requestsResponse.error;
      if (friendshipsResponse.error) throw friendshipsResponse.error;

      const requests = (requestsResponse.data ?? []) as FriendRequestRow[];
      const friendshipList = (friendshipsResponse.data ?? []) as FriendshipRow[];

      setRequestRows(requests);
      setFriendRows(friendshipList);

      const incoming = requests.filter(
        (request) =>
          request.receiver_id === userId && request.status === "pending"
      );

      const incomingSenderIds = incoming.map((request) => request.sender_id);
      const friendIds = friendshipList.map((friendship) =>
        friendship.user_id === userId
          ? friendship.friend_id
          : friendship.user_id
      );

      const profileIds = Array.from(
        new Set([...incomingSenderIds, ...friendIds])
      );

      let profileMap = new Map<string, FriendProfile>();

      if (profileIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select(
            "id,username,telegram_username,telegram_name,pet_name,comfort,level,is_vip"
          )
          .in("id", profileIds);

        if (profilesError) throw profilesError;

        profileMap = new Map(
          ((profilesData ?? []) as FriendProfile[]).map((profile) => [
            profile.id,
            profile,
          ])
        );
      }

      setIncomingRequests(
        incoming.map((request) => ({
          ...request,
          profile: profileMap.get(request.sender_id) ?? null,
        }))
      );

      setFriends(
        friendshipList.map((friendship) => {
          const friendId =
            friendship.user_id === userId
              ? friendship.friend_id
              : friendship.user_id;

          return {
            ...friendship,
            profile: profileMap.get(friendId) ?? null,
          };
        })
      );
    } catch (error) {
      console.error("TrustyPaws friends loading error:", error);
      setErrorText(ft.loadError);
    } finally {
      setLoading(false);
    }
  };

  const loadLeaderboard = async () => {
    if (!userId) return;

    setLeaderboardLoading(true);
    setLeaderboardError("");

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id,username,telegram_username,telegram_name,pet_name,comfort,level,is_vip"
        )
        .order("comfort", { ascending: false })
        .order("updated_at", { ascending: true });

      if (error) throw error;

      setLeaderboard((data ?? []) as FriendProfile[]);
    } catch (error) {
      console.error("TrustyPaws leaderboard loading error:", error);
      setLeaderboardError(ft.leaderboardError);
    } finally {
      setLeaderboardLoading(false);
    }
  };

  useEffect(() => {
    if (!supabaseReady || !userId) return;

    void loadFriendsData();
  }, [supabaseReady, userId]);

  useEffect(() => {
    if (!supabaseReady || !userId || socialSection !== "leaderboard") return;

    void loadLeaderboard();
  }, [supabaseReady, userId, socialSection]);

  useEffect(() => {
  if (!supabaseReady || !userId) {
    setReferralCount(0);
    return;
  }

  let cancelled = false;

  const loadReferralCount = async () => {
    setReferralLoading(true);

  const { count, error } =
  await supabase
    .from("referrals")
    .select("id", {
      count: "exact",
      head: true,
    })
    .eq("referrer_id", userId)
    .eq("status", "confirmed");

    if (error) {
      console.error(
        "TrustyPaws referral count error:",
        error
      );

      if (!cancelled) {
        setReferralLoading(false);
      }

      return;
    }

    if (!cancelled) {
      setReferralCount(count ?? 0);
      setReferralLoading(false);
    }
  };

  void loadReferralCount();

  const timer = window.setInterval(() => {
    void loadReferralCount();
  }, 15000);

  return () => {
    cancelled = true;
    window.clearInterval(timer);
  };
}, [
  supabaseReady,
  userId,
]);

  const copyPlayerCode = async () => {
    try {
      await navigator.clipboard.writeText(playerCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1300);
    } catch {
      setSearchMessage(playerCode);
    }
  };

  const copyReferralLink = async () => {
  if (!referralLink) {
    return;
  }

  try {
    await navigator.clipboard.writeText(
      referralLink
    );

    setReferralCopied(true);

    window.setTimeout(() => {
      setReferralCopied(false);
    }, 1500);
  } catch {
    setSearchMessage(
      referralLink
    );
  }
};

const shareReferralLink = () => {
  if (!referralLink) {
    return;
  }

  const inviteText =
    language === "en"
      ? "🐾 Join me in TrustyPaws! Take care of your cat and build the coziest home."
      : language === "ua"
      ? "🐾 Приєднуйся до мене в TrustyPaws! Піклуйся про свого котика та створи для нього найзатишніший дім."
      : "🐾 Присоединяйся ко мне в TrustyPaws! Заботься о своём котике и построй для него самый уютный дом.";

  const shareUrl =
    `https://t.me/share/url?url=${encodeURIComponent(
      referralLink
    )}&text=${encodeURIComponent(
      inviteText
    )}`;

  const telegram =
    (
      window as unknown as {
        Telegram?: {
          WebApp?: {
            openTelegramLink?: (
              url: string
            ) => void;
          };
        };
      }
    ).Telegram?.WebApp;

  if (
    typeof telegram?.openTelegramLink ===
    "function"
  ) {
    telegram.openTelegramLink(
      shareUrl
    );

    return;
  }

  window.open(
    shareUrl,
    "_blank"
  );
};

  const searchPlayer = async () => {
    if (!userId || searching) return;

    const cleanCode = searchValue.trim().toUpperCase();

    setSearchResult(null);
    setSearchMessage("");

    if (!cleanCode) return;

    if (cleanCode === playerCode) {
      setSearchMessage(ft.ownId);
      return;
    }

    setSearching(true);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id,username,telegram_username,telegram_name,pet_name,comfort,level,is_vip"
        )
        .eq("username", cleanCode)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setSearchMessage(ft.notFound);
        return;
      }

      setSearchResult(data as FriendProfile);
    } catch (error) {
      console.error("TrustyPaws player search error:", error);
      setSearchMessage(ft.actionError);
    } finally {
      setSearching(false);
    }
  };

  const relationFor = (targetId: string) => {
    const isFriend = friendRows.some(
      (row) =>
        (row.user_id === userId && row.friend_id === targetId) ||
        (row.user_id === targetId && row.friend_id === userId)
    );

    if (isFriend) return "friend" as const;

    const outgoing = requestRows.some(
      (row) =>
        row.sender_id === userId &&
        row.receiver_id === targetId &&
        row.status === "pending"
    );

    if (outgoing) return "outgoing" as const;

    const incoming = requestRows.some(
      (row) =>
        row.sender_id === targetId &&
        row.receiver_id === userId &&
        row.status === "pending"
    );

    if (incoming) return "incoming" as const;

    return "none" as const;
  };

  const sendFriendRequest = async (profile: FriendProfile) => {
    if (!userId || busyId) return;

    const relation = relationFor(profile.id);

    if (relation === "friend") {
      setSearchMessage(ft.alreadyFriend);
      return;
    }

    if (relation === "outgoing") {
      setSearchMessage(ft.pending);
      return;
    }

    if (relation === "incoming") {
      setSearchMessage(ft.incomingExists);
      return;
    }

    setBusyId(profile.id);
    setSearchMessage("");

    try {
      const { error: deleteError } = await supabase
        .from("friend_requests")
        .delete()
        .or(
          `and(sender_id.eq.${userId},receiver_id.eq.${profile.id}),and(sender_id.eq.${profile.id},receiver_id.eq.${userId})`
        )
        .in("status", ["declined", "accepted"]);

      if (deleteError) throw deleteError;

      const { error } = await supabase.from("friend_requests").insert({
        sender_id: userId,
        receiver_id: profile.id,
        status: "pending",
      });

      if (error) throw error;

      setSearchMessage(ft.requestSent);
      await loadFriendsData();
    } catch (error) {
      console.error("TrustyPaws friend request error:", error);
      setSearchMessage(ft.actionError);
    } finally {
      setBusyId(null);
    }
  };

  const acceptRequest = async (request: FriendRequestRow) => {
    if (!userId || busyId) return;

    setBusyId(request.sender_id);
    setErrorText("");

    try {
      const { error: updateError } = await supabase
        .from("friend_requests")
        .update({ status: "accepted" })
        .eq("id", request.id);

      if (updateError) throw updateError;

      const { error: friendshipError } = await supabase
        .from("friendships")
        .upsert(
          {
            user_id: userId,
            friend_id: request.sender_id,
          },
          {
            onConflict: "user_id,friend_id",
            ignoreDuplicates: true,
          }
        );

      if (friendshipError) throw friendshipError;

      await loadFriendsData();
    } catch (error) {
      console.error("TrustyPaws accept friend error:", error);
      setErrorText(ft.actionError);
    } finally {
      setBusyId(null);
    }
  };

  const declineRequest = async (request: FriendRequestRow) => {
    if (busyId) return;

    setBusyId(request.sender_id);
    setErrorText("");

    try {
      const { error } = await supabase
        .from("friend_requests")
        .update({ status: "declined" })
        .eq("id", request.id);

      if (error) throw error;

      await loadFriendsData();
    } catch (error) {
      console.error("TrustyPaws decline friend error:", error);
      setErrorText(ft.actionError);
    } finally {
      setBusyId(null);
    }
  };

  const removeFriend = async (friendship: FriendshipRow) => {
    if (!userId || busyId) return;

    const friendId =
      friendship.user_id === userId
        ? friendship.friend_id
        : friendship.user_id;

    setBusyId(friendId);
    setErrorText("");

    try {
      const { error: friendshipError } = await supabase
        .from("friendships")
        .delete()
        .eq("id", friendship.id);

      if (friendshipError) throw friendshipError;

      const { error: requestError } = await supabase
        .from("friend_requests")
        .delete()
        .or(
          `and(sender_id.eq.${userId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${userId})`
        );

      if (requestError) throw requestError;

      await loadFriendsData();
    } catch (error) {
      console.error("TrustyPaws remove friend error:", error);
      setErrorText(ft.actionError);
    } finally {
      setBusyId(null);
    }
  };

  if (!supabaseReady) {
    return (
      <div className="page">
        <PageHeader
          eyebrow={t.community}
          title={t.friendsTitle}
          subtitle={ft.subtitle}
        />

        <section className="friends-loading-card">
          <div className="friends-loading-paw">🐾</div>
          <strong>{ft.connection}</strong>
        </section>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="page">
        <PageHeader
          eyebrow={t.community}
          title={t.friendsTitle}
          subtitle={ft.subtitle}
        />

        <section className="friends-loading-card">
          <div className="friends-loading-paw">⚠️</div>
          <strong>
            {language === "en"
              ? "Could not connect to the server"
              : language === "ua"
              ? "Не вдалося підключитися до сервера"
              : "Не удалось подключиться к серверу"}
          </strong>

          <p style={{ margin: "8px 0 12px", opacity: 0.7, fontSize: "12px" }}>
            {supabaseError ||
              (language === "en"
                ? "Supabase authorization failed."
                : language === "ua"
                ? "Не вдалося авторизуватися в Supabase."
                : "Не удалось авторизоваться в Supabase.")}
          </p>

          <button
            type="button"
            className="primary-button"
            onClick={onRetrySupabase}
          >
            {language === "en"
              ? "Try again"
              : language === "ua"
              ? "Спробувати ще раз"
              : "Повторить"}
          </button>
        </section>
      </div>
    );
  }

  const myRank = leaderboard.findIndex((profile) => profile.id === userId) + 1;

  return (
    <div className="page friends-page">
      <PageHeader
        eyebrow={t.community}
        title={t.friendsTitle}
        subtitle={ft.subtitle}
        badge={
          socialSection === "friends"
            ? `${friends.length}`
            : `${leaderboard.length}`
        }
      />

      <div className="social-tabs">
  <button
    type="button"
    className={`social-tab ${
      socialSection === "friends"
        ? "social-tab-active"
        : ""
    }`}
    onClick={() =>
      setSocialSection("friends")
    }
  >
    <span className="social-tab-icon">👥</span>
    <span>{ft.friendsTab}</span>
  </button>

  <button
    type="button"
    className={`social-tab ${
      socialSection === "leaderboard"
        ? "social-tab-active"
        : ""
    }`}
    onClick={() =>
      setSocialSection("leaderboard")
    }
  >
    <span className="social-tab-icon">🏆</span>
    <span>{ft.leaderboardTab}</span>
  </button>
</div>

      {socialSection === "friends" ? (
        <>

        <section
  className="friend-search-card"
  style={{
    marginBottom: "14px",
  }}
>
  <div
    className="friend-section-heading"
    style={{
      marginBottom: "10px",
    }}
  >
    <span>🎁</span>

    <strong>
      {language === "en"
        ? "INVITE A FRIEND"
        : language === "ua"
        ? "ЗАПРОСИТИ ДРУГА"
        : "ПРИГЛАСИТЬ ДРУГА"}
    </strong>
  </div>

  <p
    style={{
      margin: "0 0 12px",
      opacity: 0.75,
      fontSize: "13px",
      lineHeight: 1.45,
    }}
  >
    {language === "en"
      ? "Invite new players to TrustyPaws and earn special rewards."
      : language === "ua"
      ? "Запрошуй нових гравців у TrustyPaws та отримуй спеціальні нагороди."
      : "Приглашай новых игроков в TrustyPaws и получай специальные награды."}
  </p>

  <div
    style={{
      padding: "11px 12px",
      borderRadius: "12px",
      background:
        "rgba(255,255,255,0.06)",
      marginBottom: "10px",
      overflowWrap: "anywhere",
      fontSize: "12px",
      opacity: 0.9,
    }}
  >
    {referralLink ||
      "TrustyPaws"}
  </div>

  <div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    marginBottom: "12px",
  }}
>
  <button
    type="button"
    className="referral-action referral-invite"
    onClick={shareReferralLink}
    disabled={!userId}
  >
    📨{" "}
    {language === "en"
      ? "Invite"
      : language === "ua"
      ? "Запросити"
      : "Пригласить"}
  </button>

  <button
    type="button"
    className={`referral-action referral-copy ${
      referralCopied
        ? "referral-copy-done"
        : ""
    }`}
    onClick={() =>
      void copyReferralLink()
    }
    disabled={!userId}
  >
    {referralCopied ? "✓" : "⧉"}{" "}
    {referralCopied
      ? language === "en"
        ? "Copied"
        : language === "ua"
        ? "Скопійовано"
        : "Скопировано"
      : language === "en"
      ? "Copy link"
      : language === "ua"
      ? "Копіювати"
      : "Копировать"}
  </button>
</div>

  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent:
        "space-between",
      paddingTop: "10px",
      borderTop:
        "1px solid rgba(255,255,255,0.08)",
    }}
  >
    <span
      style={{
        fontSize: "13px",
        opacity: 0.7,
      }}
    >
      👥{" "}
      {language === "en"
        ? "Invited players"
        : language === "ua"
        ? "Запрошено гравців"
        : "Приглашено игроков"}
    </span>

    <strong
      style={{
        fontSize: "18px",
      }}
    >
      {referralLoading
        ? "..."
        : referralCount}
    </strong>
  </div>
</section>

          <section className="player-id-card">
            <div className="player-id-icon">🐾</div>

            <div className="player-id-main">
              <span>{ft.yourId}</span>
              <strong>{playerCode}</strong>
            </div>

            <button
              type="button"
              className={`copy-player-id ${copied ? "copied" : ""}`}
              onClick={copyPlayerCode}
            >
              {copied ? `✓ ${ft.copied}` : `⧉ ${ft.copy}`}
            </button>
          </section>

          <section className="friend-search-card">
            <div className="friend-section-heading">
              <span>🔎</span>
              <strong>{ft.searchTitle}</strong>
            </div>

            <div className="friend-search-row">
              <input
                value={searchValue}
                onChange={(event) =>
                  setSearchValue(event.target.value.toUpperCase())
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") void searchPlayer();
                }}
                placeholder={ft.searchPlaceholder}
                maxLength={11}
              />

              <button
                type="button"
                onClick={() => void searchPlayer()}
                disabled={searching || !searchValue.trim()}
              >
                {searching ? ft.searching : ft.search}
              </button>
            </div>

            {searchMessage && (
              <div className="friend-search-message">{searchMessage}</div>
            )}

            {searchResult && (
              <FriendProfileCard
                profile={searchResult}
                formatNumber={formatNumber}
                comfortLabel={ft.comfort}
                levelLabel={ft.level}
                petLabel={ft.pet}
                unknownPet={ft.unknownPet}
                action={
                  relationFor(searchResult.id) === "friend"
                    ? ft.alreadyFriend
                    : relationFor(searchResult.id) === "outgoing"
                    ? ft.pending
                    : relationFor(searchResult.id) === "incoming"
                    ? ft.incomingExists
                    : ft.add
                }
                actionDisabled={
                  relationFor(searchResult.id) !== "none" ||
                  busyId === searchResult.id
                }
                onAction={() => void sendFriendRequest(searchResult)}
              />
            )}
          </section>

          {errorText && <div className="friends-error">⚠️ {errorText}</div>}

          <div className="friend-list-heading">
            <span>{ft.incoming}</span>
            <b>{incomingRequests.length}</b>
          </div>

          <div className="friend-request-list">
            {loading ? (
              <FriendSkeleton />
            ) : incomingRequests.length === 0 ? (
              <div className="friends-empty-mini">📨 {ft.noIncoming}</div>
            ) : (
              incomingRequests.map((request) => {
                const displayName = getPlayerDisplayName(request.profile);

                return (
                  <article className="friend-request-card" key={request.id}>
                    <FriendAvatar
                      name={displayName || request.profile?.pet_name || "?"}
                    />

                    <div className="friend-request-info">
                      <strong>
                        {displayName}
                        {request.profile?.is_vip ? " 👑" : ""}
                      </strong>
                      <span>
                        🐱 {request.profile?.pet_name || ft.unknownPet} · {ft.level}{" "}
                        {request.profile?.level ?? 1}
                      </span>
                    </div>

                    <div className="friend-request-actions">
                      <button
                        type="button"
                        className="friend-accept"
                        disabled={busyId === request.sender_id}
                        onClick={() => void acceptRequest(request)}
                      >
                        ✓ {ft.accept}
                      </button>

                      <button
                        type="button"
                        className="friend-decline"
                        disabled={busyId === request.sender_id}
                        onClick={() => void declineRequest(request)}
                      >
                        × {ft.decline}
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <div className="friend-list-heading friends-own-heading">
            <span>{ft.myFriends}</span>
            <b>{friends.length}</b>
          </div>

          <div className="friends-list">
            {loading ? (
              <FriendSkeleton />
            ) : friends.length === 0 ? (
              <div className="friends-empty-list">
                <div>👥</div>
                <strong>{ft.myFriends}</strong>
                <p>{ft.noFriends}</p>
              </div>
            ) : (
              friends.map((friendship) => {
                const profile = friendship.profile;
                const friendId =
                  friendship.user_id === userId
                    ? friendship.friend_id
                    : friendship.user_id;
                const displayName = getPlayerDisplayName(profile);

                return (
                  <article className="friend-card" key={friendship.id}>
                    <FriendAvatar
                      name={displayName || profile?.pet_name || "?"}
                    />

                    <div className="friend-card-main">
                      <div className="friend-card-top">
                        <div>
                          <strong>
                            {displayName}
                            {profile?.is_vip ? " 👑" : ""}
                          </strong>
                          <span>🐱 {profile?.pet_name || ft.unknownPet}</span>
                        </div>

                        <span className="friend-level">
                          LVL {profile?.level ?? 1}
                        </span>
                      </div>

                      <div className="friend-comfort">
                        <span>🐾 {ft.comfort}</span>
                        <strong>{formatNumber(profile?.comfort ?? 0)}</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="remove-friend-button"
                      disabled={busyId === friendId}
                      onClick={() => void removeFriend(friendship)}
                      title={ft.remove}
                    >
                      ×
                    </button>
                  </article>
                );
              })
            )}
          </div>
        </>
      ) : (
        <>
          <section className="friend-search-card">
            <div className="friend-section-heading">
              <span>🏆</span>
              <strong>{ft.leaderboardTitle}</strong>
            </div>

            <p style={{ margin: "6px 0 12px", opacity: 0.7, fontSize: "12px" }}>
              {ft.leaderboardSubtitle}
            </p>

            {myRank > 0 && (
              <div
                className="friend-search-message"
                style={{ marginBottom: "10px" }}
              >
                🐾 {ft.yourPlace}: <strong>#{myRank}</strong>
              </div>
            )}

            <button
              type="button"
              className="copy-player-id"
              disabled={leaderboardLoading}
              onClick={() => void loadLeaderboard()}
              style={{ width: "100%" }}
            >
              {leaderboardLoading ? "…" : `↻ ${ft.refresh}`}
            </button>
          </section>

          {leaderboardError && (
            <div className="friends-error">⚠️ {leaderboardError}</div>
          )}

          <div className="friends-list">
            {leaderboardLoading ? (
              <FriendSkeleton />
            ) : leaderboard.length === 0 ? (
              <div className="friends-empty-list">
                <div>🏆</div>
                <strong>{ft.leaderboardTitle}</strong>
                <p>{ft.leaderboardEmpty}</p>
              </div>
            ) : (
              leaderboard.map((profile, index) => {
                const place = index + 1;
                const isCurrentPlayer = profile.id === userId;
                const displayName = getPlayerDisplayName(profile);
                const placeLabel =
                  place === 1
                    ? "🥇"
                    : place === 2
                    ? "🥈"
                    : place === 3
                    ? "🥉"
                    : `#${place}`;

                return (
                  <article
                    className="friend-card"
                    key={profile.id}
                    style={
                      isCurrentPlayer
                        ? {
                            outline: "2px solid rgba(255, 255, 255, 0.18)",
                            transform: "translateZ(0)",
                          }
                        : undefined
                    }
                  >
                    <div
                      className="friend-avatar"
                      style={{ fontSize: place <= 3 ? "20px" : "13px" }}
                    >
                      {placeLabel}
                    </div>

                    <div className="friend-card-main">
                      <div className="friend-card-top">
                        <div>
                          <strong>
                            {displayName}
                            {profile.is_vip ? " 👑" : ""}
                            {isCurrentPlayer ? ` · ${ft.you}` : ""}
                          </strong>
                          <span>🐱 {profile.pet_name || ft.unknownPet}</span>
                        </div>

                        <span className="friend-level">LVL {profile.level ?? 1}</span>
                      </div>

                      <div className="friend-comfort">
                        <span>🐾 {ft.comfort}</span>
                        <strong>{formatNumber(profile.comfort ?? 0)}</strong>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FriendAvatar({ name }: { name: string }) {
  const normalized = name.replace(/^@/, "").trim();
  const letter = normalized.charAt(0).toUpperCase() || "🐾";

  return <div className="friend-avatar">{letter}</div>;
}

function FriendProfileCard({
  profile,
  formatNumber,
  comfortLabel,
  levelLabel,
  petLabel,
  unknownPet,
  action,
  actionDisabled,
  onAction,
}: {
  profile: FriendProfile;
  formatNumber: (value: number) => string;
  comfortLabel: string;
  levelLabel: string;
  petLabel: string;
  unknownPet: string;
  action: string;
  actionDisabled: boolean;
  onAction: () => void;
}) {
  const displayName = getPlayerDisplayName(profile);

  return (
    <article className="friend-search-result">
      <FriendAvatar name={displayName || profile.pet_name || "?"} />

      <div className="friend-search-result-main">
        <strong>
          {displayName}
          {profile.is_vip ? " 👑" : ""}
        </strong>
        <span>🐱 {petLabel}: {profile.pet_name || unknownPet}</span>
        <small>
          {levelLabel} {profile.level} · 🐾 {comfortLabel}:{" "}
          {formatNumber(profile.comfort)}
        </small>
      </div>

      <button
        type="button"
        disabled={actionDisabled}
        onClick={onAction}
      >
        {action}
      </button>
    </article>
  );
}

function FriendSkeleton() {
  return (
    <div className="friend-skeleton">
      <span />
      <div>
        <i />
        <i />
      </div>
    </div>
  );
}

/* =====================================================
   SHOP
===================================================== */

function ShopScreen({
  t,
  language,
  userId,
  comfort,
  purchasedPets,
  selectedPet,
  onBuyComfortPet,
  onSelectPet,
  onPurchasedPetsChange,
  formatNumber,
  supabaseReady,
  onVipStatusChange,
}: {
  t: Translation;
  language: Language;
  userId: string | null;
  comfort: number;
  purchasedPets: string[];
  selectedPet: string;
  onBuyComfortPet: (pet: Pet) => void;
  onSelectPet: (pet: Pet) => void;
  onPurchasedPetsChange: (pets: string[]) => void;
  formatNumber: (value: number) => string;
  supabaseReady: boolean;
  onVipStatusChange: (active: boolean, expiresAt: string | null) => void;
}) {
  const [vipLoading, setVipLoading] =
    useState(true);

  const [vipActive, setVipActive] =
    useState(false);

  const [vipExpiresAt, setVipExpiresAt] =
    useState<string | null>(null);

  const [vipBuying, setVipBuying] =
    useState(false);

  const [vipMessage, setVipMessage] =
    useState("");

  const [shopSection, setShopSection] =
    useState<"accessories" | "pets" | "statuses">("statuses");

  const [petShopMessage, setPetShopMessage] =
    useState("");

  const [petBuyingId, setPetBuyingId] =
    useState<string | null>(null);

  const shopText =
    language === "en"
      ? {
          accessories: "Accessories",
          pets: "Pets",
          statuses: "Statuses",
          comingTitle: "Coming in future updates",
          accessoriesDescription: "New accessories and cosmetic items for your pet will appear here.",
          petsDescription: "Choose and collect new TrustyPaws pets.",
          commonPets: "COMMON",
          rarePets: "RARE",
          ownedPet: "Owned",
          selectedPet: "Selected",
          choosePet: "Choose",
          buyPet: "Buy",
          starterPet: "Starter pet",
          telegramOnly: "Available in Telegram",
          notEnoughComfort: "Not enough Comfort",
          petBuying: "Preparing payment...",
          petPaid: "Payment received. Unlocking pet...",
          petActivated: "Pet unlocked successfully! 🐱",
          petPending: "Payment is processing. The pet will appear shortly.",
          petCancelled: "Payment cancelled.",
          petFailed: "Payment failed. Stars were not charged.",
          petInvoiceError: "Could not create the Telegram Stars invoice.",
        }
      : language === "ua"
      ? {
          accessories: "Аксесуари",
          pets: "Улюбленці",
          statuses: "Статуси",
          comingTitle: "Очікується в нових оновленнях",
          accessoriesDescription: "Тут з’являться нові аксесуари та косметичні предмети для улюбленця.",
          petsDescription: "Обирай та збирай нових улюбленців TrustyPaws.",
          commonPets: "ЗВИЧАЙНІ",
          rarePets: "РІДКІСНІ",
          ownedPet: "Придбано",
          selectedPet: "Обрано",
          choosePet: "Обрати",
          buyPet: "Купити",
          starterPet: "Стартовий улюбленець",
          telegramOnly: "Доступно в Telegram",
          notEnoughComfort: "Недостатньо Затишку",
          petBuying: "Готуємо оплату...",
          petPaid: "Оплату отримано. Відкриваємо улюбленця...",
          petActivated: "Улюбленця успішно відкрито! 🐱",
          petPending: "Платіж обробляється. Улюбленець скоро з’явиться.",
          petCancelled: "Оплату скасовано.",
          petFailed: "Оплата не пройшла. Stars не списані.",
          petInvoiceError: "Не вдалося створити рахунок Telegram Stars.",
        }
      : {
          accessories: "Аксессуары",
          pets: "Питомцы",
          statuses: "Статусы",
          comingTitle: "Ожидается в новых обновлениях",
          accessoriesDescription: "Здесь появятся новые аксессуары и косметические предметы для питомца.",
          petsDescription: "Выбирай и собирай новых питомцев TrustyPaws.",
          commonPets: "ОБЫЧНЫЕ",
          rarePets: "РЕДКИЕ",
          ownedPet: "Куплено",
          selectedPet: "Выбран",
          choosePet: "Выбрать",
          buyPet: "Купить",
          starterPet: "Стартовый питомец",
          telegramOnly: "Доступно в Telegram",
          notEnoughComfort: "Недостаточно Комфорта",
          petBuying: "Подготавливаем оплату...",
          petPaid: "Оплата получена. Открываем питомца...",
          petActivated: "Питомец успешно открыт! 🐱",
          petPending: "Платёж обрабатывается. Питомец скоро появится.",
          petCancelled: "Оплата отменена.",
          petFailed: "Оплата не прошла. Stars не списаны.",
          petInvoiceError: "Не удалось создать счёт Telegram Stars.",
        };

  const vipText =
    language === "en"
      ? {
          title: "TrustyPaws VIP",
          subtitle:
            "VIP status for 30 days. No automatic renewal.",
          price: `${VIP_PRICE_STARS} Telegram Stars`,
          buy: `Buy VIP — ${VIP_PRICE_STARS} ⭐`,
          buying: "Preparing payment...",
          active: "VIP active",
          expires: "Active until",
          renewNote:
            "When VIP expires, you decide whether to buy another 30 days. Stars are never charged automatically.",
          feature1: "🐾 +20 Comfort for every tap",
          feature2: "🏠 +22 passive Comfort per minute",
          feature3: "⚡ Maximum energy increased to 200",
          loading: "Checking VIP status...",
          needTelegram:
            "Open TrustyPaws through the Telegram bot to pay with Stars.",
          invoiceError:
            "Could not create the Telegram Stars invoice.",
          cancelled: "Payment cancelled.",
          failed: "Payment failed. Stars were not charged.",
          pending:
            "Payment is processing. VIP status will update shortly.",
          paid:
            "Payment received. Activating VIP...",
          activated:
            "VIP activated successfully! 👑",
          statusError:
            "Could not refresh VIP status.",
        }
      : language === "ua"
      ? {
          title: "TrustyPaws VIP",
          subtitle:
            "VIP-статус на 30 днів. Без автоматичного продовження.",
          price: `${VIP_PRICE_STARS} Telegram Stars`,
          buy: `Купити VIP — ${VIP_PRICE_STARS} ⭐`,
          buying: "Готуємо оплату...",
          active: "VIP активний",
          expires: "Активний до",
          renewNote:
            "Після завершення VIP ти сам вирішуєш, чи купувати ще 30 днів. Stars автоматично не списуються.",
          feature1: "🐾 +20 Затишку за кожен тап",
          feature2: "🏠 +22 пасивного Затишку за хвилину",
          feature3: "⚡ Максимум енергії збільшено до 200",
          loading: "Перевіряємо VIP-статус...",
          needTelegram:
            "Відкрий TrustyPaws через Telegram-бота, щоб оплатити Stars.",
          invoiceError:
            "Не вдалося створити рахунок Telegram Stars.",
          cancelled: "Оплату скасовано.",
          failed:
            "Оплата не пройшла. Stars не списані.",
          pending:
            "Платіж обробляється. VIP скоро оновиться.",
          paid:
            "Оплату отримано. Активуємо VIP...",
          activated:
            "VIP успішно активовано! 👑",
          statusError:
            "Не вдалося оновити VIP-статус.",
        }
      : {
          title: "TrustyPaws VIP",
          subtitle:
            "VIP-статус на 30 дней. Без автоматического продления.",
          price: `${VIP_PRICE_STARS} Telegram Stars`,
          buy: `Купить VIP — ${VIP_PRICE_STARS} ⭐`,
          buying: "Подготавливаем оплату...",
          active: "VIP активен",
          expires: "Активен до",
          renewNote:
            "После окончания VIP ты сам решаешь, покупать ли ещё 30 дней. Stars автоматически не списываются.",
          feature1: "🐾 +20 Комфорта за каждый тап",
          feature2: "🏠 +22 пассивного Комфорта в минуту",
          feature3: "⚡ Максимум энергии увеличен до 200",
          loading: "Проверяем VIP-статус...",
          needTelegram:
            "Открой TrustyPaws через Telegram-бота, чтобы оплатить Stars.",
          invoiceError:
            "Не удалось создать счёт Telegram Stars.",
          cancelled: "Оплата отменена.",
          failed:
            "Оплата не прошла. Stars не списаны.",
          pending:
            "Платёж обрабатывается. VIP скоро обновится.",
          paid:
            "Оплата получена. Активируем VIP...",
          activated:
            "VIP успешно активирован! 👑",
          statusError:
            "Не удалось обновить VIP-статус.",
        };

  const refreshPetAfterPayment = async (petId: string) => {
    if (!userId) {
      return false;
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 750);
      });

      const { data, error } = await supabase
        .from("profiles")
        .select("purchased_pets")
        .eq("id", userId)
        .single();

      if (error) {
        console.error("TrustyPaws pet refresh error:", error);
        continue;
      }

      const pets = Array.isArray(data?.purchased_pets)
        ? data.purchased_pets.filter(
            (value: unknown): value is string => typeof value === "string"
          )
        : ["default"];

      if (pets.includes(petId)) {
        onPurchasedPetsChange(pets);
        setPetShopMessage(shopText.petActivated);
        return true;
      }
    }

    setPetShopMessage(shopText.petPending);
    return false;
  };

  const buyStarPet = async (pet: Pet) => {
    if (
      petBuyingId ||
      pet.rarity !== "rare" ||
      purchasedPets.includes(pet.id) ||
      typeof pet.starsCost !== "number" ||
      !supabaseReady ||
      !userId
    ) {
      return;
    }

    setPetBuyingId(pet.id);
    setPetShopMessage("");

    let invoiceOpened = false;

    try {
      const { data, error } = await supabase.functions.invoke(
        "create-pet-invoice",
        {
          body: {
            userId,
            petId: pet.id,
          },
        }
      );

      if (error) {
        console.error("TrustyPaws pet invoice function error:", error);
        throw error;
      }

      const invoiceUrl = data?.invoiceUrl;

      if (typeof invoiceUrl !== "string" || !invoiceUrl) {
        throw new Error("Invoice URL missing");
      }

      const telegram = (
        window as unknown as {
          Telegram?: {
            WebApp?: {
              openInvoice?: (
                url: string,
                callback?: (status: string) => void
              ) => void;
              HapticFeedback?: {
                impactOccurred?: (
                  style: "light" | "medium" | "heavy"
                ) => void;
              };
            };
          };
        }
      ).Telegram?.WebApp;

      if (!telegram?.openInvoice) {
        setPetShopMessage(shopText.telegramOnly);
        return;
      }

      telegram.HapticFeedback?.impactOccurred?.("medium");

      invoiceOpened = true;

      telegram.openInvoice(invoiceUrl, (status) => {
        setPetBuyingId(null);

        if (status === "paid") {
          setPetShopMessage(shopText.petPaid);
          void refreshPetAfterPayment(pet.id);
          return;
        }

        if (status === "pending") {
          setPetShopMessage(shopText.petPending);
          void refreshPetAfterPayment(pet.id);
          return;
        }

        if (status === "failed") {
          setPetShopMessage(shopText.petFailed);
          return;
        }

        setPetShopMessage(shopText.petCancelled);
      });
    } catch (error) {
      console.error("TrustyPaws pet purchase error:", error);
      setPetShopMessage(shopText.petInvoiceError);
    } finally {
      if (!invoiceOpened) {
        setPetBuyingId(null);
      }
    }
  };

  const formatVipDate = (
    value: string
  ) => {
    const locale =
      language === "en"
        ? "en-US"
        : language === "ua"
        ? "uk-UA"
        : "ru-RU";

    try {
      return new Intl.DateTimeFormat(
        locale,
        {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      ).format(
        new Date(value)
      );
    } catch {
      return value;
    }
  };

  const loadVipStatus = async (
    silent = false
  ) => {
    if (
      !supabaseReady ||
      !userId
    ) {
      setVipActive(false);
      setVipExpiresAt(null);
      setVipLoading(false);
      return false;
    }

    if (!silent) {
      setVipLoading(true);
    }

    try {
      const {
        data,
        error,
      } = await supabase
        .from("profiles")
        .select(
          "is_vip,vip_expires_at"
        )
        .eq("id", userId)
        .single();

      if (error) {
        throw error;
      }

      const expiresAt =
        data?.vip_expires_at ??
        null;

      const active = Boolean(
        data?.is_vip === true &&
          expiresAt &&
          new Date(
            expiresAt
          ).getTime() >
            Date.now()
      );

      setVipActive(active);
      setVipExpiresAt(
        expiresAt
      );
      onVipStatusChange(active, expiresAt);

      return active;
    } catch (error) {
      console.error(
        "TrustyPaws VIP status error:",
        error
      );

      if (!silent) {
        setVipMessage(
          vipText.statusError
        );
      }

      return false;
    } finally {
      if (!silent) {
        setVipLoading(false);
      }
    }
  };

  useEffect(() => {
    void loadVipStatus();

    const timer =
      window.setInterval(
        () => {
          void loadVipStatus(
            true
          );
        },
        30000
      );

    return () => {
      window.clearInterval(
        timer
      );
    };
  }, [
    supabaseReady,
    userId,
    language,
  ]);

  const refreshVipAfterPayment =
    async () => {
      for (
        let attempt = 0;
        attempt < 8;
        attempt += 1
      ) {
        await new Promise<void>(
          (resolve) => {
            window.setTimeout(
              resolve,
              750
            );
          }
        );

        const active =
          await loadVipStatus(
            true
          );

        if (active) {
          setVipMessage(
            vipText.activated
          );
          return;
        }
      }

      setVipMessage(
        vipText.pending
      );
    };

  const buyVip = async () => {
    if (
      vipBuying ||
      vipActive ||
      !supabaseReady ||
      !userId
    ) {
      return;
    }

    setVipBuying(true);
    setVipMessage("");

    try {
      const {
        data,
        error,
      } = await supabase.functions.invoke(
        "create-vip-invoice",
        {
          body: {
            userId,
          },
        }
      );

      if (error) {
        console.error(
          "TrustyPaws invoice function error:",
          error
        );
        throw error;
      }

      const invoiceUrl =
        data?.invoiceUrl;

      if (
        typeof invoiceUrl !==
          "string" ||
        !invoiceUrl
      ) {
        throw new Error(
          "Invoice URL missing"
        );
      }

      const telegram =
        (
          window as unknown as {
            Telegram?: {
              WebApp?: {
                openInvoice?: (
                  url: string,
                  callback?: (
                    status: string
                  ) => void
                ) => void;
                HapticFeedback?: {
                  impactOccurred?: (
                    style:
                      | "light"
                      | "medium"
                      | "heavy"
                  ) => void;
                };
              };
            };
          }
        ).Telegram?.WebApp;

      if (
        !telegram?.openInvoice
      ) {
        setVipMessage(
          vipText.needTelegram
        );
        return;
      }

      telegram.HapticFeedback
        ?.impactOccurred?.(
          "medium"
        );

      telegram.openInvoice(
        invoiceUrl,
        (status) => {
          if (
            status === "paid"
          ) {
            setVipMessage(
              vipText.paid
            );

            void refreshVipAfterPayment();
            return;
          }

          if (
            status === "pending"
          ) {
            setVipMessage(
              vipText.pending
            );

            void refreshVipAfterPayment();
            return;
          }

          if (
            status === "failed"
          ) {
            setVipMessage(
              vipText.failed
            );
            return;
          }

          setVipMessage(
            vipText.cancelled
          );
        }
      );
    } catch (error) {
      console.error(
        "TrustyPaws VIP purchase error:",
        error
      );

      setVipMessage(
        vipText.invoiceError
      );
    } finally {
      setVipBuying(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow={
          t.trustyPaws
        }
        title={
          t.shopTitle
        }
        subtitle={
          t.shopSubtitle
        }
        badge={
          vipActive
            ? "VIP 👑"
            : undefined
        }
      />

      <div className="upgrade-tabs" style={{ marginBottom: "14px" }}>
        <button
          type="button"
          className={shopSection === "accessories" ? "active" : ""}
          onClick={() => setShopSection("accessories")}
        >
          🎀 {shopText.accessories}
        </button>
        <button
          type="button"
          className={shopSection === "pets" ? "active" : ""}
          onClick={() => setShopSection("pets")}
        >
          🐱 {shopText.pets}
        </button>
        <button
          type="button"
          className={shopSection === "statuses" ? "active" : ""}
          onClick={() => setShopSection("statuses")}
        >
          👑 {shopText.statuses}
        </button>
      </div>

      {shopSection === "accessories" ? (
        <section
          style={{
            padding: "28px 20px",
            borderRadius: "22px",
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.045)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "42px", marginBottom: "12px" }}>🎀</div>
          <h3 style={{ margin: "0 0 8px", fontSize: "20px" }}>
            {shopText.comingTitle}
          </h3>
          <p style={{ margin: 0, opacity: 0.68, lineHeight: 1.55 }}>
            {shopText.accessoriesDescription}
          </p>
        </section>
      ) : shopSection === "pets" ? (
        <section>
          <div
            style={{
              marginBottom: "14px",
              padding: "14px 16px",
              borderRadius: "18px",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.035)",
            }}
          >
            <strong style={{ display: "block", marginBottom: "4px" }}>
              🐱 {shopText.pets}
            </strong>
            <span style={{ fontSize: "12px", opacity: 0.66, lineHeight: 1.5 }}>
              {shopText.petsDescription}
            </span>
          </div>

          {petShopMessage && (
            <div
              style={{
                marginBottom: "12px",
                padding: "10px 12px",
                borderRadius: "14px",
                background: "rgba(255,210,85,0.09)",
                border: "1px solid rgba(255,210,85,0.18)",
                fontSize: "12px",
                fontWeight: 800,
                textAlign: "center",
              }}
            >
              {petShopMessage}
            </div>
          )}

          {[
            { key: "common", title: shopText.commonPets },
            { key: "rare", title: shopText.rarePets },
          ].map((group) => {
            const pets = PETS.filter((pet) =>
              group.key === "common"
                ? pet.rarity === "starter" || pet.rarity === "common"
                : pet.rarity === "rare"
            );

            return (
              <div key={group.key} style={{ marginBottom: "20px" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "10px",
                    fontSize: "11px",
                    fontWeight: 900,
                    letterSpacing: "0.11em",
                    opacity: 0.78,
                  }}
                >
                  <span>{group.title}</span>
                  <span>{pets.length}</span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: "10px",
                  }}
                >
                  {pets.map((pet) => {
                    const owned = purchasedPets.includes(pet.id);
                    const selected = selectedPet === pet.id;
                    const affordable =
                      pet.rarity === "common" &&
                      typeof pet.comfortCost === "number" &&
                      comfort >= pet.comfortCost;

                    return (
                      <article
                        key={pet.id}
                        style={{
                          minWidth: 0,
                          overflow: "hidden",
                          borderRadius: "18px",
                          border: selected
                            ? "1px solid rgba(255,211,91,0.48)"
                            : pet.rarity === "rare"
                            ? "1px solid rgba(151,111,255,0.25)"
                            : "1px solid rgba(255,255,255,0.08)",
                          background: pet.rarity === "rare"
                            ? "linear-gradient(155deg, rgba(77,55,118,0.24), rgba(24,27,34,0.96))"
                            : "rgba(255,255,255,0.035)",
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            aspectRatio: "1 / 1",
                            display: "grid",
                            placeItems: "center",
                            padding: "8px",
                            background: pet.rarity === "rare"
                              ? "radial-gradient(circle at 50% 35%, rgba(137,103,255,0.18), transparent 62%)"
                              : "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.07), transparent 64%)",
                          }}
                        >
                          <img
                            src={pet.image}
                            alt={pet.name}
                            draggable="false"
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                              filter: selected ? "drop-shadow(0 8px 14px rgba(255,202,66,0.18))" : undefined,
                            }}
                            onError={(event) => {
                              const image = event.currentTarget;
                              if (!image.dataset.fallback) {
                                image.dataset.fallback = "true";
                                image.src = assetUrl("cat-3d.png");
                              }
                            }}
                          />

                          <span
                            style={{
                              position: "absolute",
                              top: "8px",
                              left: "8px",
                              padding: "4px 7px",
                              borderRadius: "999px",
                              background: pet.rarity === "rare"
                                ? "rgba(123,81,220,0.72)"
                                : "rgba(0,0,0,0.38)",
                              fontSize: "8px",
                              fontWeight: 900,
                            }}
                          >
                            {pet.rarity === "rare"
                              ? `✦ ${shopText.rarePets}`
                              : pet.rarity === "starter"
                              ? shopText.starterPet
                              : shopText.commonPets}
                          </span>
                        </div>

                        <div style={{ padding: "10px" }}>
                          <strong
                            style={{
                              display: "block",
                              marginBottom: "7px",
                              fontSize: "14px",
                            }}
                          >
                            {pet.name}
                          </strong>

                          {selected ? (
                            <button
                              type="button"
                              disabled
                              style={{
                                width: "100%",
                                minHeight: "38px",
                                border: 0,
                                borderRadius: "12px",
                                background: "rgba(255,210,76,0.14)",
                                color: "#ffd75d",
                                fontWeight: 900,
                              }}
                            >
                              ✓ {shopText.selectedPet}
                            </button>
                          ) : owned ? (
                            <button
                              type="button"
                              onClick={() => onSelectPet(pet)}
                              style={{
                                width: "100%",
                                minHeight: "38px",
                                border: "1px solid rgba(255,255,255,0.09)",
                                borderRadius: "12px",
                                background: "rgba(255,255,255,0.07)",
                                color: "white",
                                fontWeight: 900,
                                cursor: "pointer",
                              }}
                            >
                              {shopText.choosePet}
                            </button>
                          ) : pet.rarity === "rare" ? (
                            <>
                              <div
                                style={{
                                  marginBottom: "8px",
                                  fontSize: "13px",
                                  fontWeight: 900,
                                }}
                              >
                                ⭐ {pet.starsCost}
                              </div>
                              <button
                                type="button"
                                disabled={petBuyingId !== null}
                                onClick={() => {
                                  void buyStarPet(pet);
                                }}
                                style={{
                                  width: "100%",
                                  minHeight: "38px",
                                  border: "1px solid rgba(255,255,255,0.09)",
                                  borderRadius: "12px",
                                  background: petBuyingId === pet.id
                                    ? "rgba(111,74,210,0.42)"
                                    : "linear-gradient(135deg, rgba(111,74,210,0.85), rgba(63,77,175,0.88))",
                                  color: "white",
                                  fontWeight: 900,
                                  cursor: petBuyingId === null ? "pointer" : "not-allowed",
                                  opacity: petBuyingId !== null && petBuyingId !== pet.id ? 0.55 : 1,
                                }}
                              >
                                {petBuyingId === pet.id
                                  ? shopText.petBuying
                                  : `⭐ ${pet.starsCost}`}
                              </button>
                              <small
                                style={{
                                  display: "block",
                                  marginTop: "6px",
                                  fontSize: "9px",
                                  opacity: 0.55,
                                  textAlign: "center",
                                }}
                              >
                                {shopText.telegramOnly}
                              </small>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={!affordable}
                                onClick={() => onBuyComfortPet(pet)}
                                style={{
                                  width: "100%",
                                  minHeight: "38px",
                                  border: 0,
                                  borderRadius: "12px",
                                  background: affordable
                                    ? "linear-gradient(135deg, #e9bc4b, #d9912d)"
                                    : "rgba(255,255,255,0.06)",
                                  color: affordable ? "#291b00" : "rgba(255,255,255,0.42)",
                                  fontWeight: 900,
                                  cursor: affordable ? "pointer" : "not-allowed",
                                }}
                              >
                                🐾 {formatNumber(pet.comfortCost ?? 0)}
                              </button>
                              {!affordable && (
                                <small
                                  style={{
                                    display: "block",
                                    marginTop: "6px",
                                    fontSize: "9px",
                                    opacity: 0.5,
                                    textAlign: "center",
                                  }}
                                >
                                  {shopText.notEnoughComfort}
                                </small>
                              )}
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
      <section
        style={{
          position: "relative",
          overflow: "hidden",
          padding: "22px",
          borderRadius: "22px",
          border:
            vipActive
              ? "1px solid rgba(255,190,70,0.42)"
              : "1px solid rgba(255,255,255,0.10)",
          background:
            "linear-gradient(145deg, rgba(40,34,24,0.96), rgba(20,25,32,0.98))",
          boxShadow:
            "0 18px 45px rgba(0,0,0,0.24)",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "180px",
            height: "180px",
            borderRadius:
              "50%",
            right: "-70px",
            top: "-85px",
            background:
              "rgba(255,181,58,0.12)",
            filter:
              "blur(4px)",
            pointerEvents:
              "none",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems:
              "center",
            gap: "14px",
            marginBottom:
              "16px",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius:
                "17px",
              display: "grid",
              placeItems:
                "center",
              fontSize: "28px",
              background:
                "rgba(255,183,63,0.13)",
              border:
                "1px solid rgba(255,183,63,0.24)",
              flexShrink: 0,
            }}
          >
            👑
          </div>

          <div
            style={{
              flex: 1,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize:
                  "12px",
                letterSpacing:
                  "0.12em",
                fontWeight: 800,
                color:
                  "#ffbd4a",
                marginBottom:
                  "4px",
              }}
            >
              VIP
            </div>

            <h2
              style={{
                margin: 0,
                fontSize:
                  "24px",
              }}
            >
              {vipText.title}
            </h2>
          </div>

          <div
            style={{
              fontWeight: 900,
              fontSize: "18px",
              color:
                "#ffbd4a",
              whiteSpace:
                "nowrap",
            }}
          >
            {VIP_PRICE_STARS} ⭐
          </div>
        </div>

        <p
          style={{
            margin:
              "0 0 18px",
            opacity: 0.72,
            lineHeight: 1.55,
          }}
        >
          {vipText.subtitle}
        </p>

        <div
          style={{
            display: "grid",
            gap: "9px",
            marginBottom:
              "18px",
          }}
        >
          <div>
            {vipText.feature1}
          </div>
          <div>
            {vipText.feature2}
          </div>
          <div>
            {vipText.feature3}
          </div>
        </div>

        {vipLoading ? (
          <div
            style={{
              padding:
                "13px 15px",
              borderRadius:
                "14px",
              background:
                "rgba(255,255,255,0.05)",
              textAlign:
                "center",
              opacity: 0.72,
            }}
          >
            {vipText.loading}
          </div>
        ) : vipActive ? (
          <div
            style={{
              padding:
                "15px 16px",
              borderRadius:
                "16px",
              background:
                "rgba(255,183,63,0.10)",
              border:
                "1px solid rgba(255,183,63,0.22)",
            }}
          >
            <div
              style={{
                fontWeight: 900,
                color:
                  "#ffbd4a",
                marginBottom:
                  "5px",
              }}
            >
              ✓ {vipText.active}
            </div>

            {vipExpiresAt && (
              <div
                style={{
                  fontSize:
                    "13px",
                  opacity: 0.78,
                }}
              >
                {vipText.expires}: {" "}
                <strong>
                  {formatVipDate(
                    vipExpiresAt
                  )}
                </strong>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            disabled={
              vipBuying ||
              !userId ||
              !supabaseReady
            }
            onClick={() =>
              void buyVip()
            }
            style={{
              width: "100%",
              minHeight:
                "52px",
              border: 0,
              borderRadius:
                "15px",
              fontWeight: 900,
              fontSize:
                "15px",
              cursor:
                vipBuying
                  ? "wait"
                  : "pointer",
              background:
                "linear-gradient(135deg, #ffb63e, #ffcc65)",
              color: "#17130d",
              opacity:
                vipBuying ||
                !userId ||
                !supabaseReady
                  ? 0.58
                  : 1,
            }}
          >
            {vipBuying
              ? vipText.buying
              : vipText.buy}
          </button>
        )}

        {vipMessage && (
          <div
            style={{
              marginTop:
                "12px",
              padding:
                "11px 13px",
              borderRadius:
                "13px",
              background:
                "rgba(255,255,255,0.055)",
              fontSize:
                "13px",
              lineHeight: 1.4,
              textAlign:
                "center",
            }}
          >
            {vipMessage}
          </div>
        )}

        <div
          style={{
            marginTop:
              "14px",
            fontSize:
              "12px",
            opacity: 0.58,
            lineHeight: 1.5,
            textAlign:
              "center",
          }}
        >
          {vipText.renewNote}
        </div>
      </section>
      )}
    </div>
  );
}

/* =====================================================
   PAGE HEADER
===================================================== */

function PageHeader({
  eyebrow,
  title,
  subtitle,
  badge,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <header className="page-header">

      <div>

        <span className="eyebrow">
          {eyebrow}
        </span>

        <h1>
          {title}
        </h1>

        <p>
          {subtitle}
        </p>

      </div>

      {badge && (
        <div className="header-badge">
          {badge}
        </div>
      )}

    </header>
  );
}

/* =====================================================
   STAT
===================================================== */

function Stat({
  icon,
  value,
  label,
}: {
  icon: string;
  value: string;
  label: string;
}) {
  return (
    <div className="stat-card">

      <div className="stat-icon">
        {icon}
      </div>

      <div>

        <strong>
          {value}
        </strong>

        <span>
          {label}
        </span>

      </div>

    </div>
  );
}

function TaskCard({
  t,
  icon,
  title,
  description,
  progress,
  progressText,
  reward,
  completed,
  available,
  onClaim,
}: {
  t: Translation;
  icon: string;
  title: string;
  description: string;
  progress: number;
  progressText: string;
  reward: number;
  completed: boolean;
  available: boolean;
  onClaim: () => void;
}) {
  return (
    <article
      className={`task-card ${
        completed
          ? "completed-card"
          : ""
      }`}
    >

      <div className="task-icon">
        {icon}
      </div>

      <div className="task-main">

        <div className="task-title-row">

          <h3>
            {title}
          </h3>

          <span className="task-reward">
            +{reward} 🐾
          </span>

        </div>

        <p>
          {description}
        </p>

        <div className="progress-info">

          <div className="progress-track">

            <div
              className="progress-fill"
              style={{
                width: `${Math.min(
                  100,
                  Math.max(
                    0,
                    progress
                  )
                )}%`,
              }}
            />

          </div>

          <span>
            {progressText}
          </span>

        </div>

      </div>

      <div className="task-action">

        {completed ? (
          <div className="task-completed">
            ✓
          </div>
        ) : available ? (
          <button
            type="button"
            className="claim-button"
            onClick={
              onClaim
            }
          >
            {t.claim}
          </button>
        ) : (
          <div className="task-waiting">
            {t.taskInProgress}
          </div>
        )}

      </div>

    </article>
  );
}

/* =====================================================
   BOTTOM NAVIGATION
===================================================== */

function BottomNavigation({
  t,
  activeTab,
  setActiveTab,
  hasTaskReward,
}: {
  t: Translation;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  hasTaskReward: boolean;
}) {
  const items: {
    id: Tab;
    icon: string;
    label: string;
  }[] = [
    { id: "home", icon: "⌂", label: t.home },
    { id: "upgrades", icon: "✦", label: t.upgrades },
    { id: "tasks", icon: "✓", label: t.tasks },
    { id: "friends", icon: "♟", label: t.friends },
    { id: "shop", icon: "▣", label: t.shop },
  ];

  return (
    <nav className="bottom-nav">
      <div className="bottom-nav-inner">
        {items.map((item) => {
          const active = activeTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${active ? "active" : ""}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="nav-icon-wrap">
                <span className="nav-icon">{item.icon}</span>

                {item.id === "tasks" && hasTaskReward && (
                  <span className="nav-dot" />
                )}
              </span>

              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export default App;