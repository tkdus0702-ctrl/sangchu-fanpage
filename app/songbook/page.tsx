"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

import QueuePanel from "@/app/components/QueuePanel";

type SoopChatMessage = {
  message?: string;
  userId?: string;
  userNickname?: string;
};

type SoopChatSdk = {
  setAuth: (token: string) => void;
  connect: () => Promise<unknown> | void;
  disconnect: () => void;
  getRoomInfo: () => Promise<{ chatNumber: number; bjId: string }>;
  handleMessageReceived: (
    callback: (action: string, message: SoopChatMessage) => void
  ) => void;
  handleChatClosed: (callback: () => void) => void;
  handleError: (callback: (code: string, message: string) => void) => void;
};

const getSoopSdkGlobal = () =>
  (window as Window & {
    SOOP?: { ChatSDK: new (clientId: string) => SoopChatSdk };
  }).SOOP;

const SOOP_CLIENT_ID = process.env.NEXT_PUBLIC_SOOP_CLIENT_ID;

type SongCategory = {
  id: number;
  name: string;
  position: number;
};

const parseCategories = (value: unknown): string[] =>
  String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);

export default function Home() {
  const [songs, setSongs] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  // Supabase에서 관리하는 동적 카테고리
  const [categoryList, setCategoryList] = useState<SongCategory[]>([]);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryName, setEditingCategoryName] = useState<string | null>(null);
  const [categoryEditValue, setCategoryEditValue] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  // 공지사항
  const [notice, setNotice] = useState({ title: "노래책 필독사항", content: "노래 신청 전 필독사항을 확인해주세요!" });
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeEditing, setNoticeEditing] = useState(false);
  const [noticeTitleDraft, setNoticeTitleDraft] = useState("");
  const [noticeContentDraft, setNoticeContentDraft] = useState("");
  const [noticeSaving, setNoticeSaving] = useState(false);

  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [artistFilter, setArtistFilter] = useState<Set<string>>(new Set());
  const [showAllArtists, setShowAllArtists] = useState(false);
  const [artistModalOpen, setArtistModalOpen] = useState(false);
const [artistModalSearch, setArtistModalSearch] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<number | null>(
    null
  );

  // 커버 자동 검색
  const [updatingCovers, setUpdatingCovers] = useState(false);
  const [coverProgress, setCoverProgress] = useState({
    processed: 0,
    total: 0,
  });

  const [isAdmin, setIsAdmin] = useState(false);

  // SOOP 채팅 연결 상태
  const soopSdkRef = useRef<SoopChatSdk | null>(null);
  const processingSoopRequestsRef = useRef<Set<string>>(new Set());

  // SOOP 자동 재연결 관리
  const soopRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soopRetryCountRef = useRef(0);
  const soopConnectingRef = useRef(false);
  const soopShouldReconnectRef = useRef(true);
  const soopAttemptIdRef = useRef(0);
  const soopLoggingOutRef = useRef(false);

  const [soopConnected, setSoopConnected] = useState(false);
  const [soopAuthenticated, setSoopAuthenticated] = useState(false);
  const [soopBusy, setSoopBusy] = useState(false);
  const [soopLoggingOut, setSoopLoggingOut] = useState(false);
  const [soopStatus, setSoopStatus] = useState("연결 안 됨");

// 노래별 Queue 추가 / 방문자 요청 처리 상태
const [processingSongIds, setProcessingSongIds] =
  useState<Record<number, boolean>>({});
const [requestedSongIds, setRequestedSongIds] =
  useState<Record<number, boolean>>({});

  // 보기 방식
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // 정렬
  const [sortMode, setSortMode] = useState<
    "latest" | "artist" | "title" | "popular"
  >("latest");

  // 로그인
  const [showLogin, setShowLogin] = useState(false);
  const [password, setPassword] = useState("");

  // 좋아요
  const [likeCounts, setLikeCounts] = useState<Record<number, number>>({});
  const [likedSongs, setLikedSongs] = useState<Record<number, boolean>>({});
  const [userId, setUserId] = useState("");
  const [animatingLike, setAnimatingLike] = useState<number | null>(null);

// 수정
const [editingSong, setEditingSong] = useState<any | null>(null);
const [editTitle, setEditTitle] = useState("");
const [editArtist, setEditArtist] = useState("");
const [editCategory, setEditCategory] = useState<string[]>([]);
const [editDifficulty, setEditDifficulty] = useState<number | null>(null);
const [editInstUrl, setEditInstUrl] = useState("");
const [editLyrics, setEditLyrics] = useState("");
const [savingEdit, setSavingEdit] = useState(false);

// 가사 보기 모달
const [songMediaModal, setSongMediaModal] = useState<any>(null);
const [instExpanded, setInstExpanded] = useState(false);
const [lyricsExpanded, setLyricsExpanded] = useState(false);
const [isEditingInstUrl, setIsEditingInstUrl] = useState(false);
const [instUrlDraft, setInstUrlDraft] = useState("");
const [savingInstUrl, setSavingInstUrl] = useState(false);

const [isEditingLyrics, setIsEditingLyrics] = useState(false);
const [lyricsDraft, setLyricsDraft] = useState("");
const [savingLyrics, setSavingLyrics] = useState(false);
  // 카테고리 목록 조회
  const fetchNotice = async () => {
    try {
      const response = await fetch("/api/notice", { cache: "no-store" });
      const result = await response.json();
      if (response.ok && result.notice) setNotice(result.notice);
    } catch (error) { console.error("공지 조회 오류:", error); }
  };

  const saveNotice = async () => {
    if (!noticeTitleDraft.trim() || !noticeContentDraft.trim() || noticeSaving) return;
    setNoticeSaving(true);
    try {
      const response = await fetch("/api/notice", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: noticeTitleDraft.trim(), content: noticeContentDraft.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "공지 저장에 실패했습니다.");
      setNotice(result.notice);
      setNoticeEditing(false);
      setNoticeOpen(true);
    } catch (error) {
      alert(error instanceof Error ? error.message : "공지 저장에 실패했습니다.");
    } finally { setNoticeSaving(false); }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch("/api/categories", {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "카테고리 조회에 실패했습니다.");
      }

      setCategoryList(result.categories ?? []);
    } catch (error) {
      console.error("[카테고리 조회 오류]", error);
    }
  };

  // 카테고리 추가
  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name || savingCategory) return;

    setSavingCategory(true);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "카테고리 추가에 실패했습니다.");
      }

      setNewCategoryName("");
      await fetchCategories();
      alert(`'${name}' 카테고리를 추가했습니다.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "카테고리 추가에 실패했습니다.");
    } finally {
      setSavingCategory(false);
    }
  };
// 카테고리 순서 변경
const handleMoveCategory = async (
  id: number,
  direction: "up" | "down"
) => {
  if (savingCategory) return;

  setSavingCategory(true);

  try {
    const response = await fetch("/api/categories", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, direction }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "카테고리 순서 변경에 실패했습니다."
      );
    }

    await fetchCategories();
  } catch (error) {
    alert(
      error instanceof Error
        ? error.message
        : "카테고리 순서 변경에 실패했습니다."
    );
  } finally {
    setSavingCategory(false);
  }
};
  // 카테고리 이름 변경 및 기존 노래 데이터 일괄 변경
  const handleRenameCategory = async (oldName: string) => {
    const newName = categoryEditValue.trim();
    if (!newName || savingCategory) return;

    if (newName === oldName) {
      setEditingCategoryName(null);
      setCategoryEditValue("");
      return;
    }

    setSavingCategory(true);
    try {
      const response = await fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName, newName }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "카테고리 변경에 실패했습니다.");
      }

      setCategoryFilter((current) =>
        current.map((item) => item === oldName ? newName : item)
      );
      setEditCategory((current) =>
        current.map((item) => item === oldName ? newName : item)
      );
      setEditingCategoryName(null);
      setCategoryEditValue("");
      await fetchCategories();
      await fetchSongsAgain();
      alert(`'${oldName}' 카테고리를 '${newName}'(으)로 변경했습니다.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "카테고리 변경에 실패했습니다.");
    } finally {
      setSavingCategory(false);
    }
  };

  // 카테고리 삭제: 노래는 유지하고 해당 카테고리만 제거
  const handleDeleteCategory = async (name: string) => {
    if (savingCategory) return;

    const confirmed = confirm(
      `'${name}' 카테고리를 삭제할까요?\n\n기존 노래에서는 이 카테고리만 제거되며 노래 자체는 삭제되지 않습니다.`
    );
    if (!confirmed) return;

    setSavingCategory(true);
    try {
      const response = await fetch("/api/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "카테고리 삭제에 실패했습니다.");
      }

      setCategoryFilter((current) => current.filter((item) => item !== name));
      setEditCategory((current) => current.filter((item) => item !== name));
      await fetchCategories();
      await fetchSongsAgain();
      alert(`'${name}' 카테고리를 삭제했습니다.`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "카테고리 삭제에 실패했습니다.");
    } finally {
      setSavingCategory(false);
    }
  };

  // 카테고리 변경 후 최신 노래 목록 다시 조회
  const fetchSongsAgain = async () => {
    const { data, error } = await supabase
      .from("songs")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("[노래 목록 새로고침 오류]", error);
      return;
    }

    setSongs(data || []);
  };

  // 관리자 로그인
  const handleAdminLogin = async () => {
    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      const result = await response.json();

      if (result.success) {
        setIsAdmin(true);
        setShowLogin(false);
        setPassword("");
        alert("관리자 모드가 활성화되었습니다.");
      } else {
        alert(result.message || "로그인에 실패했습니다.");
      }
    } catch (error) {
      console.error(error);
      alert("로그인 중 오류가 발생했습니다.");
    }
  };

  // 관리자 로그아웃
  const handleAdminLogout = async () => {
    const confirmed = confirm("관리자 모드를 종료하시겠습니까?");

    if (!confirmed) return;

    try {
      const response = await fetch("/api/admin-logout", {
        method: "POST",
      });

      const result = await response.json();

      if (result.success) {
        // 관리자 로그아웃 시 채팅 재연결을 중단하고 연결만 해제합니다.
        soopShouldReconnectRef.current = false;
        if (soopRetryTimerRef.current) {
          clearTimeout(soopRetryTimerRef.current);
          soopRetryTimerRef.current = null;
        }
        soopRetryCountRef.current = 0;
        disconnectSoopChat();
        setIsAdmin(false);
        alert("로그아웃되었습니다.");
      } else {
        alert(result.message || "로그아웃에 실패했습니다.");
      }
    } catch (error) {
      console.error(error);
      alert("로그아웃 중 오류가 발생했습니다.");
    }
  };
// SOOP Chat SDK 스크립트 로드
const loadSoopSdk = (): Promise<void> =>
  new Promise((resolve, reject) => {
    if (getSoopSdkGlobal()?.ChatSDK) {
      resolve();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-soop-chat-sdk="true"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (getSoopSdkGlobal()?.ChatSDK) resolve();
        else reject(new Error("SOOP.ChatSDK를 찾을 수 없습니다."));
      }, { once: true });
      existingScript.addEventListener(
        "error",
        () => reject(new Error("SOOP SDK 로드 실패")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.dataset.soopChatSdk = "true";
    script.src =
      "https://static.sooplive.com/asset/app/chat-sdk/sooplive-chat-sdk.js";
    script.onload = () => {
      if (getSoopSdkGlobal()?.ChatSDK) resolve();
      else reject(new Error("SOOP.ChatSDK를 찾을 수 없습니다."));
    };
    script.onerror = () => reject(new Error("SOOP SDK 로드 실패"));
    document.head.appendChild(script);
  });

// SOOP 채팅의 !요청 / !신청 제목 처리
const handleSoopSongRequest = async (message: SoopChatMessage) => {
  const text = String(message.message ?? "").trim();
  const match = text.match(/^!(?:요청|신청)\s+(.+)$/u);
  if (!match) return;

  const title = match[1].trim();
  const userId = String(message.userId ?? "").trim();
  const nickname = message.userNickname || userId || "알 수 없는 사용자";
  if (!title || !userId) return;

  const processingKey = `${userId}:${text}`;
  if (processingSoopRequestsRef.current.has(processingKey)) return;
  processingSoopRequestsRef.current.add(processingKey);

  try {
    const response = await fetch("/api/soop/chat-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ title, userId }),
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      console.warn(
        `[SOOP] ${nickname} 요청 실패:`,
        result.message ?? "알 수 없는 오류"
      );
      return;
    }

    console.info(
      `[SOOP] ${nickname} 요청 등록:`,
      result.request?.title ?? title
    );
    window.dispatchEvent(new Event("queue-refresh"));
  } catch (error) {
    console.error("[SOOP] 노래 요청 처리 오류:", error);
  } finally {
    processingSoopRequestsRef.current.delete(processingKey);
  }
};

// 연결 실패 시 재시도 간격: 3초 → 6초 → 12초 → 최대 30초
function scheduleSoopReconnect() {
  if (!soopShouldReconnectRef.current) return;
  if (soopRetryTimerRef.current) return;

  const delays = [3000, 6000, 12000, 30000];
  const delay = delays[Math.min(soopRetryCountRef.current, delays.length - 1)];
  soopRetryCountRef.current += 1;

  setSoopStatus(`연결 끊김 · ${Math.round(delay / 1000)}초 후 재연결 시도`);

  soopRetryTimerRef.current = setTimeout(() => {
    soopRetryTimerRef.current = null;
    if (soopShouldReconnectRef.current) {
      void connectSoopChat(true, true);
    }
  }, delay);
}

// SOOP 채팅 연결 및 자동 재연결
const connectSoopChat = async (
  fromOAuthCallback = false,
  automatic = false
) => {
  if (!isAdmin && !fromOAuthCallback) {
    if (!automatic) alert("관리자 로그인 후 이용해주세요.");
    return;
  }

  if (soopConnectingRef.current) return;

  if (soopSdkRef.current) {
    setSoopConnected(true);
    setSoopStatus("이미 채팅에 연결되어 있습니다.");
    return;
  }

  if (!SOOP_CLIENT_ID) {
    setSoopStatus("SOOP Client ID 환경 변수를 확인해주세요.");
    return;
  }

  soopConnectingRef.current = true;
  const attemptId = ++soopAttemptIdRef.current;
  setSoopBusy(true);
  setSoopStatus(automatic ? "SOOP 채팅 재연결 중..." : "SOOP 인증 확인 중...");

  let sdk: SoopChatSdk | null = null;

  try {
    const tokenResponse = await fetch("/api/soop/test-token", {
      cache: "no-store",
      credentials: "same-origin",
    });
    const tokenData = await tokenResponse.json();

    if (attemptId !== soopAttemptIdRef.current) return;

    if (!tokenResponse.ok || !tokenData.accessToken) {
      setSoopAuthenticated(false);
      setSoopConnected(false);

      if (automatic) {
        setSoopStatus("SOOP 인증이 필요합니다. API 연결 버튼을 눌러주세요.");
        return;
      }

      window.location.assign("/api/soop/auth");
      return;
    }

    setSoopAuthenticated(true);
    setSoopStatus("채팅 SDK 로드 중...");
    await loadSoopSdk();

    if (attemptId !== soopAttemptIdRef.current) return;

    const soopGlobal = getSoopSdkGlobal();
    if (!soopGlobal?.ChatSDK) {
      throw new Error("SOOP.ChatSDK를 찾을 수 없습니다.");
    }

    sdk = new soopGlobal.ChatSDK(SOOP_CLIENT_ID);
    soopSdkRef.current = sdk;
    sdk.setAuth(tokenData.accessToken);

    sdk.handleMessageReceived((action, message) => {
      if (action !== "MESSAGE") return;
      const chatText = String(message.message ?? "").trim();
      if (/^!(?:요청|신청)\s+/u.test(chatText)) {
        void handleSoopSongRequest(message);
      }
    });

    sdk.handleChatClosed(() => {
      // 이미 새 SDK로 교체됐거나 사용자가 직접 연결을 끊은 경우 무시
      if (soopSdkRef.current !== sdk) return;

      soopSdkRef.current = null;
      setSoopConnected(false);
      setSoopStatus("채팅 연결 종료");

      if (soopShouldReconnectRef.current) {
        scheduleSoopReconnect();
      }
    });

    sdk.handleError((code, message) => {
      console.error("[SOOP SDK 오류]", code, message);
      setSoopStatus(`SDK 오류: ${code}`);
    });

    setSoopStatus("채팅 서버 연결 중...");
    await sdk.connect();
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // 사용자가 로그아웃했거나 더 최신 연결 시도가 시작됐다면 중단
    if (attemptId !== soopAttemptIdRef.current) return;

    // 연결 확인 대기 중 SDK가 종료되었는지 확인
    if (soopSdkRef.current !== sdk) {
      throw new Error("채팅 연결이 도중에 종료되었습니다.");
    }

    const room = await sdk.getRoomInfo();
    if (attemptId !== soopAttemptIdRef.current) return;

    if (!room.bjId || room.chatNumber === 0) {
      throw new Error("방송 정보를 가져오지 못했습니다.");
    }

    soopRetryCountRef.current = 0;
    setSoopConnected(true);
    setSoopAuthenticated(true);
    setSoopStatus(`연결됨: ${room.bjId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[SOOP 연결 실패]", error);
    setSoopConnected(false);
    setSoopStatus(`연결 실패: ${errorMessage}`);

    if (sdk && soopSdkRef.current === sdk) {
      soopSdkRef.current = null;
    }

    if (sdk) {
      try {
        sdk.disconnect();
      } catch (disconnectError) {
        console.warn("[SOOP] 연결 정리 중 오류:", disconnectError);
      }
    }

    if (soopShouldReconnectRef.current) {
      scheduleSoopReconnect();
    }
  } finally {
    soopConnectingRef.current = false;
    setSoopBusy(false);
  }
};

// 채팅 연결만 해제하고 인증 토큰은 유지
const disconnectSoopChat = () => {
  const sdk = soopSdkRef.current;
  soopSdkRef.current = null;
  setSoopConnected(false);

  if (sdk) {
    try {
      sdk.disconnect();
    } catch (error) {
      console.warn("[SOOP] SDK 연결 해제 중 오류:", error);
    }
  }

  setSoopStatus("채팅 연결 해제됨 (인증 유지)");
};

// SOOP 로그아웃: 자동 재연결 중단 + SDK 종료 + 저장된 토큰 삭제
const logoutSoop = async () => {
  if (soopLoggingOutRef.current) return;

  if (!confirm("SOOP 로그아웃을 진행할까요? 저장된 인증 토큰이 삭제됩니다.")) {
    return;
  }

  soopLoggingOutRef.current = true;
  setSoopLoggingOut(true);
  // 진행 중인 연결 시도까지 무효화하여 로그아웃 후 다시 연결되지 않게 함
  soopAttemptIdRef.current += 1;
  soopShouldReconnectRef.current = false;

  if (soopRetryTimerRef.current) {
    clearTimeout(soopRetryTimerRef.current);
    soopRetryTimerRef.current = null;
  }

  soopRetryCountRef.current = 0;
  setSoopBusy(true);
  disconnectSoopChat();

  try {
    const response = await fetch("/api/soop/reset-auth", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error ?? "SOOP 로그아웃에 실패했습니다.");
    }

    setSoopAuthenticated(false);
    setSoopConnected(false);
    setSoopStatus("SOOP 로그아웃 완료");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    setSoopStatus(`로그아웃 실패: ${errorMessage}`);
    alert(errorMessage);
  } finally {
    soopLoggingOutRef.current = false;
    setSoopLoggingOut(false);
    setSoopBusy(false);
  }
};

  // 앨범 커버 버튼: 관리자면 Queue 추가, 방문자면 요청 등록
  const handleSongQueueAction = async (song: any) => {
    if (processingSongIds[song.id]) return;

    if (!isAdmin && !userId) {
      alert("잠시 후 다시 시도해주세요.");
      return;
    }

    setProcessingSongIds((current) => ({ ...current, [song.id]: true }));

    try {
      if (isAdmin) {
        const response = await fetch("/api/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            song_id: String(song.id),
            title: song.title,
            artist: song.artist,
            key: song.key,
            category: song.category,
            difficulty: song.difficulty,
          }),
        });

        const result = await response.json().catch(() => ({}));

        if (response.status === 409) {
          alert("이미 Queue에 있는 노래예요.");
          return;
        }

        if (!response.ok) {
          alert(result.message || result.error || "Queue 추가에 실패했습니다.");
          return;
        }

        window.dispatchEvent(new Event("queue-refresh"));
        alert(`「${song.title}」 노래를 Queue에 추가했어요.`);
        return;
      }

      const response = await fetch("/api/song-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          song_id: String(song.id),
          title: song.title,
          artist: song.artist,
          key: song.key,
          category: song.category,
          difficulty: song.difficulty,
          requester_id: userId,
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (response.ok || response.status === 409) {
        setRequestedSongIds((current) => ({ ...current, [song.id]: true }));
        alert(
          response.status === 409
            ? "이미 요청 대기 중인 노래예요."
            : "노래 요청을 보냈어요! 관리자에게 전달됐습니다."
        );
        return;
      }

      alert(result.message || "요청 등록에 실패했습니다.");
    } catch (error) {
      console.error(error);
      alert("처리 중 오류가 발생했습니다.");
    } finally {
      setProcessingSongIds((current) => ({ ...current, [song.id]: false }));
    }
  };

  // 커버 자동 검색
 const handleUpdateCovers = async () => {
  if (!isAdmin || updatingCovers) return;

  const targets = songs.filter(
    (song) => !song.cover_url
  );

  if (targets.length === 0) {
    alert("이미 모든 노래에 커버가 있습니다.");
    return;
  }

  const confirmed = confirm(
    "커버가 없는 " +
      targets.length +
      "곡의 앨범 커버를 자동으로 찾아볼까요?\n\n" +
      "이미 커버가 있는 노래는 건너뜁니다.\n\n" +
      "Bugs에서 먼저 찾고, 없으면 YouTube에서 찾습니다."
  );

  if (!confirmed) return;

  setUpdatingCovers(true);

  setCoverProgress({
    processed: 0,
    total: targets.length,
  });

  let processed = 0;
  let found = 0;
  let notFound = 0;
  let failed = 0;
  let youtubeLimited = false;

  try {
    for (const song of targets) {
      try {
        console.log(
          "커버 검색 시작:",
          song.title,
          "/",
          song.artist
        );

        const response = await fetch(
          "/api/cover",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              songId: song.id,
            }),
          }
        );

        /*
         * 응답을 바로 response.json()으로 읽지 않고
         * 먼저 text로 받아서 서버에서 이상한 응답이 와도
         * 정확하게 확인할 수 있도록 함
         */
        const responseText =
          await response.text();

        let result: any = null;

        if (responseText.trim()) {
          try {
            result =
              JSON.parse(
                responseText
              );
          } catch (jsonError) {
            console.error(
              "커버 API JSON 변환 실패:",
              song.title,
              responseText
            );

            failed++;

            processed++;

            setCoverProgress({
              processed,
              total:
                targets.length,
            });

            continue;
          }
        } else {
          result = null;
        }

        console.log(
          "커버 API 응답:",
          song.title,
          "HTTP",
          response.status,
          result
        );

        // HTTP 자체가 실패한 경우
        if (!response.ok) {
          failed++;

          console.error(
            "커버 검색 HTTP 실패:",
            song.title,
            "HTTP",
            response.status,
            result
          );
        }

        // 커버 발견
        else if (
          result &&
          result.status ===
            "updated" &&
          result.coverUrl
        ) {
          found++;

          setSongs(
            (currentSongs) =>
              currentSongs.map(
                (currentSong) =>
                  currentSong.id ===
                  song.id
                    ? {
                        ...currentSong,
                        cover_url:
                          result.coverUrl,
                      }
                    : currentSong
              )
          );

          console.log(
            "커버 적용 완료:",
            song.title,
            "(" +
              (result.source ||
                "unknown") +
              ")"
          );
        }

        // 커버 없음
        else if (
          result &&
          result.status ===
            "not_found"
        ) {
          notFound++;

          console.log(
            "커버를 찾지 못함:",
            song.title,
            "/",
            song.artist
          );
        }

        // YouTube API 제한
        else if (
          result &&
          result.status ===
            "youtube_limited"
        ) {
          youtubeLimited = true;
          notFound++;

          console.warn(
            "YouTube API 제한:",
            song.title,
            "/",
            song.artist
          );
        }

        // 빈 응답
        else if (
          result === null ||
          (typeof result ===
            "object" &&
            Object.keys(result)
              .length === 0)
        ) {
          failed++;

          console.error(
            "커버 API가 빈 응답을 반환했습니다:",
            song.title,
            "HTTP",
            response.status,
            "응답:",
            responseText
          );
        }

        // 알 수 없는 응답
        else {
          failed++;

          console.error(
            "알 수 없는 커버 검색 결과:",
            song.title,
            result
          );
        }
      } catch (error) {
        failed++;

        console.error(
          "커버 검색 오류:",
          song.title,
          error
        );
      }

      processed++;

      setCoverProgress({
        processed,
        total: targets.length,
      });

      // 서버 요청 사이에 잠시 대기
      if (
        processed <
        targets.length
      ) {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              1200
            )
        );
      }
    }

    let message =
      "앨범 커버 검색이 완료되었습니다!\n\n" +
      "전체: " +
      targets.length +
      "곡\n" +
      "찾음: " +
      found +
      "곡\n" +
      "찾지 못함: " +
      notFound +
      "곡\n" +
      "오류: " +
      failed +
      "곡";

    if (youtubeLimited) {
      message +=
        "\n\n⚠️ YouTube API 사용량 제한이 발생했습니다.";
    }

    alert(message);
  } catch (error) {
    console.error(
      "커버 전체 업데이트 오류:",
      error
    );

    alert(
      "앨범 커버 업데이트 중 오류가 발생했습니다."
    );
  } finally {
    setUpdatingCovers(false);

    setCoverProgress({
      processed: 0,
      total: 0,
    });
  }
};

  // 페이지 진입 시 관리자와 SOOP 인증 상태를 확인하고 자동 연결
  useEffect(() => {
    let cancelled = false;

    const url = new URL(window.location.href);
    const isOAuthCallback = url.searchParams.get("autoconnect") === "1";

    if (isOAuthCallback) {
      url.searchParams.delete("autoconnect");
      url.searchParams.delete("soop");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    }

    const initializeSoop = async () => {
      try {
        const adminResponse = await fetch("/api/admin-check", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const adminResult = await adminResponse.json();
        if (cancelled) return;

        const adminLoggedIn = adminResponse.ok && Boolean(adminResult.success);
        setIsAdmin(adminLoggedIn);

        if (!adminLoggedIn) {
          setSoopStatus("관리자 로그인이 필요합니다.");
          return;
        }

        const tokenResponse = await fetch("/api/soop/test-token", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const tokenResult = await tokenResponse.json();
        if (cancelled) return;

        const hasToken = tokenResponse.ok && Boolean(tokenResult.accessToken);
        setSoopAuthenticated(hasToken);

        if (hasToken) {
          soopShouldReconnectRef.current = true;
          await connectSoopChat(true, true);
        } else if (isOAuthCallback) {
          setSoopStatus("SOOP 인증 상태를 확인해주세요.");
        } else {
          setSoopStatus("SOOP 연결 대기 중");
        }
      } catch (error) {
        console.error("[SOOP 초기화 실패]", error);
        if (!cancelled) setSoopStatus("SOOP 연결 상태 확인 실패");
      }
    };

    void initializeSoop();

    return () => {
      cancelled = true;
    };
    // 최초 페이지 진입 시 한 번 실행
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 페이지를 벗어날 때 타이머와 브라우저 SDK 연결 정리
  useEffect(() => {
    return () => {
      if (soopRetryTimerRef.current) {
        clearTimeout(soopRetryTimerRef.current);
        soopRetryTimerRef.current = null;
      }
      const sdk = soopSdkRef.current;
      soopSdkRef.current = null;
      if (sdk) {
        try {
          sdk.disconnect();
        } catch (error) {
          console.warn("[SOOP] 페이지 종료 시 연결 정리 오류:", error);
        }
      }
    };
  }, []);

  // 관리자 상태 확인
useEffect(() => {
  const checkAdmin = () => {
    fetch("/api/admin-check", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setIsAdmin(data.success))
      .catch(() => setIsAdmin(false));
  };

  checkAdmin();

  window.addEventListener("admin-status-change", checkAdmin);

  return () => {
    window.removeEventListener("admin-status-change", checkAdmin);
  };
}, []);

  // 페이지 진입 시 동적 카테고리 목록 조회
  useEffect(() => {
    void fetchCategories();
    void fetchNotice();
    // 최초 진입 시 한 번만 조회
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 노래 가져오기
  useEffect(() => {
    const fetchSongs = async () => {
      const { data, error } = await supabase
        .from("songs")
        .select("*")
        .order("id", {
          ascending: true,
        });

      if (error) {
        console.error(error);
        return;
      }

      setSongs(data || []);
    };

    fetchSongs();
  }, []);

  // 익명 사용자 ID
  useEffect(() => {
    let id = localStorage.getItem(
      "songbook-user-id"
    );

    if (!id) {
      id = crypto.randomUUID();

      localStorage.setItem(
        "songbook-user-id",
        id
      );
    }

    setUserId(id);
  }, []);

  // 좋아요 가져오기
  useEffect(() => {
    if (!userId) return;

    const fetchLikes = async () => {
      try {
        const response = await fetch(
          "/api/likes?userId=" +
            encodeURIComponent(userId)
        );

        const result = await response.json();

        if (result.success) {
          setLikeCounts(result.likes || {});
          setLikedSongs(
            result.likedByMe || {}
          );
        }
      } catch (error) {
        console.error(error);
      }
    };

    fetchLikes();
  }, [userId]);

  // 좋아요
  const handleLike = async (songId: number) => {
    if (!userId) return;

    const isLiked = likedSongs[songId];

    setAnimatingLike(songId);

    setTimeout(() => {
      setAnimatingLike(null);
    }, 350);

    // 화면 먼저 변경
    setLikedSongs((current) => ({
      ...current,
      [songId]: !isLiked,
    }));

    setLikeCounts((current) => ({
      ...current,
      [songId]: Math.max(
        0,
        (current[songId] || 0) +
          (isLiked ? -1 : 1)
      ),
    }));

    try {
      const response = isLiked
        ? await fetch(
            "/api/likes?songId=" +
              songId +
              "&userId=" +
              encodeURIComponent(userId),
            {
              method: "DELETE",
            }
          )
        : await fetch("/api/likes", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              songId,
              userId,
            }),
          });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            "좋아요 처리 실패"
        );
      }
    } catch (error) {
      console.error(error);

      // 실패하면 원상복구
      setLikedSongs((current) => ({
        ...current,
        [songId]: isLiked,
      }));

      setLikeCounts((current) => ({
        ...current,
        [songId]: Math.max(
          0,
          (current[songId] || 0) +
            (isLiked ? 1 : -1)
        ),
      }));

      alert(
        "좋아요 처리 중 오류가 발생했습니다."
      );
    }
  };

  const toggleEditCategory = (category: string) => {
    setEditCategory((prev) =>
      prev.includes(category)
        ? prev.filter((item) => item !== category)
        : [...prev, category]
    );
  };
// 가사 보기 또는 검색
const handleInstAction = (song: any) => {
  // INST 주소가 없으면 바로 유튜브 검색
  if (!song.inst_url?.trim()) {
    window.open(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(
        `${song.title} ${song.artist} inst`
      )}`,
      "_blank",
      "noopener,noreferrer"
    );
    return;
  }

  // 영상은 펼치고 가사는 접은 상태로 모달 열기
  setInstExpanded(true);
  setLyricsExpanded(false);
  setSongMediaModal(song);
};

const handleLyricsAction = (song: any) => {
  // 가사가 없으면 바로 구글 검색
  if (!song.lyrics?.trim()) {
    window.open(
      `https://www.google.com/search?q=${encodeURIComponent(
        `${song.title} ${song.artist} 가사`
      )}`,
      "_blank",
      "noopener,noreferrer"
    );
    return;
  }

  // 가사는 펼치고 영상은 접은 상태로 모달 열기
  setInstExpanded(false);
  setLyricsExpanded(true);
  setSongMediaModal(song);
};
const handleSaveInstUrl = async () => {
  if (!songMediaModal) return;

  setSavingInstUrl(true);

  try {
    const response = await fetch("/api/songs", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: songMediaModal.id,
        inst_url: instUrlDraft,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      alert(result.error || "영상 링크 저장에 실패했어요.");
      return;
    }

    setSongs((prev: any[]) =>
      prev.map((song) =>
        song.id === songMediaModal.id ? result.song : song
      )
    );

    setSongMediaModal(result.song);
    setIsEditingInstUrl(false);

    alert("영상 링크가 수정되었어요!");
  } catch (error) {
    console.error(error);
    alert("영상 링크 저장 중 오류가 발생했어요.");
  } finally {
    setSavingInstUrl(false);
  }
};
const handleSaveLyrics = async () => {
  if (!songMediaModal) return;

  setSavingLyrics(true);

  try {
    const response = await fetch("/api/songs", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: songMediaModal.id,
        lyrics: lyricsDraft,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      alert(result.error || "가사 저장에 실패했어요.");
      return;
    }

    setSongs((prev: any[]) =>
      prev.map((song) =>
        song.id === songMediaModal.id ? result.song : song
      )
    );

    setSongMediaModal(result.song);
    setIsEditingLyrics(false);

    alert("가사가 수정되었어요!");
  } catch (error) {
    console.error(error);
    alert("가사 저장 중 오류가 발생했어요.");
  } finally {
    setSavingLyrics(false);
  }
};
const getYoutubeEmbedUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    let videoId = "";

    if (parsed.hostname.includes("youtu.be")) {
      videoId = parsed.pathname.slice(1);
    } else if (parsed.hostname.includes("youtube.com")) {
      videoId =
        parsed.searchParams.get("v") ||
        parsed.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1] ||
        "";
    }

   return videoId
  ? `https://www.youtube-nocookie.com/embed/${videoId}`
  : null;
  } catch {
    return null;
  }
};
// 수정창 열기
const openEdit = (song: any) => {
  setEditingSong(song);
  setEditTitle(song.title || "");
  setEditArtist(song.artist || "");
  setEditCategory(parseCategories(song.category));
  setEditDifficulty(song.difficulty ?? null);
  setEditInstUrl(song.inst_url || "");
  setEditLyrics(song.lyrics || "");
};

 // 수정창 닫기
const closeEdit = () => {
  setEditingSong(null);
  setEditTitle("");
  setEditArtist("");
  setEditCategory([]);
  setEditDifficulty(null);
  setEditInstUrl("");
  setEditLyrics("");
};

  // 노래 수정
  const handleEdit = async () => {
    if (!editingSong) return;

    if (
      !editTitle.trim() ||
      !editArtist.trim()
    ) {
      alert(
        "노래 제목과 아티스트를 입력해주세요."
      );
      return;
    }

    setSavingEdit(true);

    try {
      const response = await fetch("/api/songs", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
  id: editingSong.id,
  title: editTitle.trim(),
  artist: editArtist.trim(),
  category: editCategory.join(","),
  difficulty: editDifficulty,
  inst_url: editInstUrl.trim(),
  lyrics: editLyrics,
}),
      });

      const result = await response.json();

      if (!response.ok) {
        alert(
          result.error ||
            result.message ||
            "노래 수정에 실패했습니다."
        );
        return;
      }

      setSongs((currentSongs) =>
        currentSongs.map((song) =>
          song.id === editingSong.id
            ? result.song
            : song
        )
      );

      closeEdit();

      alert(
        '"' +
          editTitle.trim() +
          '" 노래가 수정되었습니다.'
      );
    } catch (error) {
      console.error(error);

      alert(
        "노래 수정 중 오류가 발생했습니다."
      );
    } finally {
      setSavingEdit(false);
    }
  };
// 커버만 삭제
const handleDeleteCover = async (
  id: number,
  title: string
) => {
  if (!isAdmin) return;

  const confirmed = confirm(
    '"' +
      title +
      '"의 앨범 커버만 삭제하시겠습니까?\n\n' +
      "노래 정보와 좋아요는 삭제되지 않습니다."
  );

  if (!confirmed) return;

  try {
    const response = await fetch("/api/songs", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id,
        clearCover: true,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      alert(
        result.error ||
          result.message ||
          "커버 삭제에 실패했습니다."
      );
      return;
    }

    setSongs((currentSongs) =>
      currentSongs.map((song) =>
        song.id === id
          ? {
              ...song,
              cover_url: null,
            }
          : song
      )
    );

    alert(
      '"' +
        title +
        "의 커버가 삭제되었습니다."
    );
  } catch (error) {
    console.error(error);

    alert(
      "커버 삭제 중 오류가 발생했습니다."
    );
  }
};
  // 노래 삭제
  const handleDelete = async (
    id: number,
    title: string
  ) => {
    const confirmed = confirm(
      '"' +
        title +
        '" 노래를 정말 삭제하시겠습니까?'
    );

    if (!confirmed) return;

    try {
      const response = await fetch(
        "/api/songs?id=" + id,
        {
          method: "DELETE",
        }
      );

      const result = await response.json();

      if (!response.ok) {
        alert(
          result.error ||
            result.message ||
            "노래 삭제에 실패했습니다."
        );
        return;
      }

      setSongs((currentSongs) =>
        currentSongs.filter(
          (song) => song.id !== id
        )
      );

      alert(
        '"' +
          title +
          '" 노래가 삭제되었습니다.'
      );
    } catch (error) {
      console.error(error);

      alert(
        "노래 삭제 중 오류가 발생했습니다."
      );
    }
  };
  // 카테고리별 등록 곡 수 계산
  const categorySongCounts = new Map<string, number>();

  songs.forEach((song) => {
    const songCategories = parseCategories(song.category);

    songCategories.forEach((category) => {
      categorySongCounts.set(
        category,
        (categorySongCounts.get(category) ?? 0) + 1
      );
    });
  });
  // 등록된 곡 수가 많은 가수부터 정렬하고, 곡 수가 같으면 가나다/알파벳순 정렬
  const artistSongCounts = new Map<string, number>();

  songs.forEach((song) => {
    const artist = String(song.artist ?? "").trim();
    if (!artist) return;
    artistSongCounts.set(artist, (artistSongCounts.get(artist) ?? 0) + 1);
  });

  const allArtists = Array.from(artistSongCounts.keys()).sort((a, b) => {
    const countDifference =
      (artistSongCounts.get(b) ?? 0) - (artistSongCounts.get(a) ?? 0);

    if (countDifference !== 0) return countDifference;

    return a.localeCompare(b, "ko", {
      sensitivity: "base",
      numeric: true,
    });
  });

  const firstArtists = allArtists.slice(0, 8);
  const visibleArtists = showAllArtists
    ? allArtists
    : [...firstArtists, ...Array.from(artistFilter).filter((artist) => !firstArtists.includes(artist))];

  // 검색 + 필터
  const filteredSongs = songs.filter(
    (song) => {
      const keyword =
        search.toLowerCase();

      const title = String(
        song.title || ""
      ).toLowerCase();

      const artist = String(
        song.artist || ""
      ).toLowerCase();

      const matchesSearch =
        title.includes(keyword) ||
        artist.includes(keyword);

      const songCategories = parseCategories(song.category);

// 선택한 카테고리를 모두 포함하면 표시 (추가 카테고리는 허용)
const matchesCategory =
  categoryFilter.length === 0 ||
  categoryFilter.every((category) =>
    songCategories.includes(category)
  );

      const matchesArtist =
        artistFilter.size === 0 ||
        artistFilter.has(String(song.artist ?? "").trim());

      const matchesDifficulty =
        difficultyFilter === null ||
        song.difficulty ===
          difficultyFilter;

      return (
        matchesSearch &&
        matchesCategory &&
        matchesArtist &&
        matchesDifficulty
      );
    }
  );

  // 정렬
  const sortedSongs = [
    ...filteredSongs,
  ].sort((a, b) => {
    if (sortMode === "latest") {
      return b.id - a.id;
    }

    if (sortMode === "artist") {
      const artistA = String(
        a.artist || ""
      );

      const artistB = String(
        b.artist || ""
      );

      const result =
        artistA.localeCompare(
          artistB,
          "ko"
        );

      if (result !== 0) {
        return result;
      }

      return a.id - b.id;
    }

    if (sortMode === "title") {
      const titleA = String(
        a.title || ""
      );

      const titleB = String(
        b.title || ""
      );

      const result =
        titleA.localeCompare(
          titleB,
          "ko"
        );

      if (result !== 0) {
        return result;
      }

      return a.id - b.id;
    }

    if (sortMode === "popular") {
      const likesA =
        likeCounts[a.id] || 0;

      const likesB =
        likeCounts[b.id] || 0;

      if (likesA !== likesB) {
        return likesB - likesA;
      }

      return a.id - b.id;
    }

    return 0;
  });

  return (
    <main className="min-h-screen bg-[#f7f9f0] text-[#416b36]">
      {/* 헤더 */}
      <header className="border-b border-[#dce8c6] bg-[#f7f9f0]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          <div
            onClick={() =>
              window.scrollTo({
                top: 0,
                behavior: "smooth",
              })
            }
            className="group text-left cursor-pointer"
          >
           <div className="flex items-center gap-0">
  <img
    src="/overlay/sangchu2.png"
    alt="유상츄"
    className="h-15 w-22 rounded-full object-contain"
  />
              <div>
         <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-[#416b36]">
  유상츄 노래책  🎙️

</h1>

                <p className="mt-0.5 text-xs text-[#82936e]">
                  SOOP 버츄얼 스트리머 유상츄의 노래책 ♫
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">

            {isAdmin && (
              <>
                <button
                  onClick={() => {
                    window.location.href =
                      "/add";
                  }}
                  className="rounded-full bg-[#8caf59] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#739b45] hover:shadow-md"
                >
                  + 노래 추가
                </button>
<div className="flex shrink-0 items-center gap-2 whitespace-nowrap">
  {!soopAuthenticated ? (
    <button
      onClick={() => {
        if (soopBusy || soopLoggingOut) return;
        soopShouldReconnectRef.current = true;
        void connectSoopChat();
      }}
      disabled={soopBusy || soopLoggingOut}
      className="rounded-full border border-[#dce8c6] bg-white px-3 py-2 text-sm font-medium text-[#8caf59] transition hover:bg-[#e4efd5] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {soopBusy ? "⏳ SOOP 연결 중..." : "📡 SOOP API 연결"}
    </button>
  ) : (
    <>
      <button
        onClick={() => void logoutSoop()}
        disabled={soopLoggingOut}
        className="rounded-full border border-[#e7caca] bg-white px-3 py-2 text-sm font-medium text-[#b45d5d] transition hover:bg-[#fff0f0] disabled:cursor-not-allowed disabled:opacity-50"
        title="SOOP API 인증을 해제하고 채팅 연결을 종료합니다."
      >
        {soopLoggingOut ? "⏳ 연결 해제 중..." : "🔌 API 연결 해제"}
      </button>

      {!soopConnected && (
        <button
          onClick={() => {
            if (soopBusy || soopLoggingOut) return;
            soopShouldReconnectRef.current = true;
            void connectSoopChat();
          }}
          disabled={soopBusy || soopLoggingOut}
          className="rounded-full border border-[#dce8c6] bg-white px-3 py-2 text-sm font-medium text-[#8caf59] transition hover:bg-[#e4efd5] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {soopBusy ? "⏳ 채팅 연결 중..." : "🔄 채팅 재연결"}
        </button>
      )}
    </>
  )}
</div>
<span className="max-w-40 truncate text-xs text-[#82936e]" title={soopStatus}>
  {`SOOP: ${soopStatus}`}
</span>
                <button
                  onClick={
                    handleUpdateCovers
                  }
                  disabled={updatingCovers}
                  className="rounded-full border border-[#dce8c6] bg-white px-4 py-2 text-sm font-medium text-[#8caf59] transition hover:bg-[#edf5df] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updatingCovers
                    ? "🖼️ " +
                      coverProgress.processed +
                      "/" +
                      coverProgress.total
                    : "🖼️ 커버 자동 찾기"}
                </button>

              </>
            )}
          </div>
        </div>
      </header>



  {/* 공지사항 모달 */}
{noticeOpen && (
  <div
    className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-[3px]"
    onClick={() => {
      setNoticeOpen(false);
      setNoticeEditing(false);
    }}
  >
    <div
      className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-[#dce8c6] bg-[#fdfefb] shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      {/* 모달 헤더 */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#e4efd5] bg-[#f7f9f0] px-6 py-5 sm:px-8">
        <div>
          <p className="text-xs font-bold tracking-widest text-[#8caf59]">
            SANGCHU SONGBOOK
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-[#416b36] sm:text-xl">
            📢 {notice.title || "노래책 필독사항"}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => {
            setNoticeOpen(false);
            setNoticeEditing(false);
          }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dce8c6] bg-white text-lg text-[#82936e] transition hover:bg-[#edf5df]"
          aria-label="공지 닫기"
        >
          ✕
        </button>
      </div>

      {/* 공지 내용 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
        {noticeEditing ? (
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-bold text-[#416b36]">
                공지 제목
              </label>
              <input
                value={noticeTitleDraft}
                onChange={(e) => setNoticeTitleDraft(e.target.value)}
                maxLength={60}
                placeholder="공지 제목"
                className="w-full rounded-xl border border-[#dce8c6] bg-white px-4 py-3 text-sm text-[#416b36] outline-none focus:border-[#8caf59]"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-[#416b36]">
                공지 내용
              </label>
              <textarea
                value={noticeContentDraft}
                onChange={(e) => setNoticeContentDraft(e.target.value)}
                rows={12}
                maxLength={5000}
                placeholder="공지 내용을 입력해주세요."
                className="w-full resize-y rounded-xl border border-[#dce8c6] bg-white px-4 py-3 text-sm leading-7 text-[#416b36] outline-none focus:border-[#8caf59]"
              />
            </div>
          </div>
        ) : (
          <div className="min-h-[180px] whitespace-pre-wrap break-words text-sm leading-8 text-[#416b36] sm:text-base sm:leading-9">
            {notice.content}
          </div>
        )}
      </div>

      {/* 모달 하단 버튼 */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#e4efd5] bg-white px-6 py-4 sm:px-8">
        <span className="text-xs text-[#a0ad91]">
          유상츄 노래책
        </span>

        <div className="flex gap-2">
          {isAdmin && !noticeEditing && (
            <button
              type="button"
              onClick={() => {
                setNoticeTitleDraft(notice.title);
                setNoticeContentDraft(notice.content);
                setNoticeEditing(true);
              }}
              className="rounded-xl border border-[#dce8c6] px-4 py-2.5 text-sm font-semibold text-[#8caf59] transition hover:bg-[#f7f9f0]"
            >
              ✏️ 수정
            </button>
          )}

          {noticeEditing && (
            <>
              <button
                type="button"
                onClick={() => setNoticeEditing(false)}
                className="rounded-xl border border-[#dce8c6] px-4 py-2.5 text-sm font-semibold text-[#82936e]"
              >
                취소
              </button>

              <button
                type="button"
                onClick={() => void saveNotice()}
                disabled={noticeSaving}
                className="rounded-xl bg-[#8caf59] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#739b45] disabled:opacity-50"
              >
                {noticeSaving ? "저장 중..." : "저장"}
              </button>
            </>
          )}

          {!noticeEditing && (
            <button
              type="button"
              onClick={() => setNoticeOpen(false)}
              className="rounded-xl bg-[#8caf59] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#739b45]"
            >
              확인
            </button>
          )}
        </div>
      </div>
    </div>
  </div>
)}
{/* 가수 선택 모달 */}
{artistModalOpen && (
  <div
    className="fixed inset-0 z-[9997] flex items-center justify-center bg-black/55 px-4 py-6 backdrop-blur-[3px]"
    onClick={() => setArtistModalOpen(false)}
  >
    <div
      className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-[#dce8c6] bg-[#fdfefb] shadow-2xl"
      onClick={(event) => event.stopPropagation()}
    >
      {/* 헤더 */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#e4efd5] bg-[#f7f9f0] px-6 py-5">
        <div>
          <p className="text-xs font-bold tracking-widest text-[#8caf59]">
            SANGCHU SONGBOOK
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-[#416b36]">
            🎤 가수 선택
          </h2>
          <p className="mt-1 text-xs text-[#82936e]">
            원하는 가수를 여러 명 선택할 수 있어요.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setArtistModalOpen(false)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#dce8c6] bg-white text-lg text-[#82936e] hover:bg-[#edf5df]"
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      {/* 검색 및 선택 상태 */}
      <div className="shrink-0 space-y-3 border-b border-[#e4efd5] px-6 py-4">
        <input
          type="text"
          value={artistModalSearch}
          onChange={(e) => setArtistModalSearch(e.target.value)}
          placeholder="가수 이름 검색..."
          className="w-full rounded-xl border border-[#dce8c6] bg-white px-4 py-3 text-sm text-[#416b36] outline-none focus:border-[#8caf59]"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-[#82936e]">
            총 {allArtists.length}명 · {artistFilter.size}명 선택됨
          </span>

          <button
            type="button"
            onClick={() => setArtistFilter(new Set())}
            className="rounded-lg border border-[#dce8c6] px-3 py-1.5 text-xs font-medium text-[#8caf59] hover:bg-[#f7f9f0]"
          >
            전체 선택 해제
          </button>
        </div>
      </div>

      {/* 가수 목록 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {allArtists.filter((artist) =>
          artist.toLowerCase().includes(
            artistModalSearch.trim().toLowerCase()
          )
        ).length === 0 ? (
          <div className="py-12 text-center text-sm text-[#a0ad91]">
            검색 결과가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-8">
            {allArtists
              .filter((artist) =>
                artist.toLowerCase().includes(
                  artistModalSearch.trim().toLowerCase()
                )
              )
              .map((artist) => {
                const selected = artistFilter.has(artist);

                return (
                  <button
                    key={artist}
                    type="button"
                    onClick={() =>
                      setArtistFilter((current) => {
                        const next = new Set(current);

                        if (next.has(artist)) {
                          next.delete(artist);
                        } else {
                          next.add(artist);
                        }

                        return next;
                      })
                    }
                    className={
                      selected
                        ? "rounded-lg border border-[#8caf59] bg-[#eaf2df] px-2 py-2 text-left text-xs font-semibold text-[#416b36] transition"
                        : "rounded-lg border border-[#e4eadb] bg-white px-2 py-2 text-left text-xs text-[#416b36] transition hover:border-[#a9c98b] hover:bg-[#f7f9f0]"
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {artist}
                      </span>

                      {selected && (
                        <span className="shrink-0 text-[#8caf59]">
                          ✓
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 text-[10px] text-[#82936e]">
                      노래 {artistSongCounts.get(artist) ?? 0}곡
                    </p>
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* 하단 */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#e4efd5] bg-white px-6 py-4">
        <span className="text-xs text-[#82936e]">
          {artistFilter.size === 0
            ? "전체 가수 표시"
            : `${artistFilter.size}명의 가수 선택`}
        </span>

        <button
          type="button"
          onClick={() => setArtistModalOpen(false)}
          className="rounded-xl bg-[#8caf59] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#739b45]"
        >
          선택 완료
        </button>
      </div>
    </div>
  </div>
)}

{/* 통합 노래 감상실 */}
{songMediaModal && (
  <div
    className="fixed inset-0 z-[10001] flex items-center justify-center overflow-y-auto bg-black/70 px-3 py-5 backdrop-blur-sm"
    onClick={() => setSongMediaModal(null)}
  >
    <div
      className="my-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-[#dce8c6] bg-[#fdfefb] shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {/* 상단 제목 */}
      <div className="flex items-center justify-between border-b border-[#e4efd5] bg-[#f7f9f0] px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-widest text-[#8caf59]">
            SANGCHU SONGBOOK · MUSIC ROOM
          </p>
          <h2 className="mt-1 truncate text-lg font-extrabold text-[#416b36]">
            {songMediaModal.title}
          </h2>
          <p className="text-sm text-[#82936e]">
            {songMediaModal.artist}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSongMediaModal(null)}
          className="ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg text-[#82936e] shadow-sm transition hover:bg-[#e4efd5]"
        >
          ✕
        </button>
      </div>

      {/* 영상 + 가사 아코디언 */}
<div className="grid grid-cols-1 items-start gap-4 bg-[#fbfcf8] p-4 sm:p-5 md:grid-cols-2">

  {/* INST 영상 영역 */}
  <div className="overflow-hidden rounded-2xl border border-[#dce8c6] bg-white">

    <button
      type="button"
      onClick={() => setInstExpanded(!instExpanded)}
      className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-[#f7f9f0]"
    >
      <div>
        <h3 className="font-bold text-[#416b36]">
          ▶ INST 영상
        </h3>
        <p className="mt-1 text-xs text-[#82936e]">
          {songMediaModal.inst_url?.trim()
            ? "등록된 INST 영상"
            : "등록된 영상이 없습니다."}
        </p>
      </div>

      <span className="text-lg text-[#8caf59]">
        {instExpanded ? "−" : "+"}
      </span>
    </button>

    {instExpanded && (
      <div className="border-t border-[#e4efd5]">
        <div className="aspect-video w-full max-w-full bg-black">
          {songMediaModal.inst_url?.trim() &&
          getYoutubeEmbedUrl(songMediaModal.inst_url) ? (
            <iframe
              src={getYoutubeEmbedUrl(songMediaModal.inst_url) || ""}
              title={`${songMediaModal.title} INST`}
              className="h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-white">
              <span className="text-4xl">♫</span>
              <p className="text-sm text-white/70">
                재생할 수 있는 영상이 없어요.
              </p>
              <button
                type="button"
                onClick={() =>
                  window.open(
                    `https://www.youtube.com/results?search_query=${encodeURIComponent(
                      `${songMediaModal.title} ${songMediaModal.artist} inst`
                    )}`,
                    "_blank",
                    "noopener,noreferrer"
                  )
                }
                className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#416b36]"
              >
                유튜브에서 검색
              </button>
            </div>
          )}
        </div>

       
<div className="border-t border-[#e4efd5] px-4 py-3">
  <div className="flex items-center justify-between gap-3">
    {songMediaModal.inst_url?.trim() ? (
      <button
        type="button"
        onClick={() =>
          window.open(
            songMediaModal.inst_url,
            "_blank",
            "noopener,noreferrer"
          )
        }
        className="text-xs font-semibold text-[#8caf59] hover:underline"
      >
        유튜브에서 영상 열기 ↗
      </button>
    ) : (
      <span className="text-xs text-[#82936e]">
        등록된 영상 링크가 없어요.
      </span>
    )}

    {isAdmin && (
      <button
        type="button"
        onClick={() => {
          setInstUrlDraft(songMediaModal.inst_url || "");
          setIsEditingInstUrl(!isEditingInstUrl);
        }}
        className="rounded-lg border border-[#dce8c6] px-3 py-2 text-xs font-bold text-[#416b36] transition hover:bg-[#f7f9f0]"
      >
        ✏️ 영상 링크 수정
      </button>
    )}
  </div>

  {isAdmin && isEditingInstUrl && (
    <div className="mt-3 flex flex-col gap-2">
      <input
        type="url"
        value={instUrlDraft}
        onChange={(e) => setInstUrlDraft(e.target.value)}
        placeholder="유튜브 영상 URL을 입력하세요."
        className="w-full rounded-xl border border-[#dce8c6] px-3 py-2.5 text-sm outline-none focus:border-[#8caf59]"
      />

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setIsEditingInstUrl(false)}
          className="rounded-lg border border-[#dce8c6] px-3 py-2 text-xs text-[#82936e]"
        >
          취소
        </button>

        <button
          type="button"
          onClick={handleSaveInstUrl}
          disabled={savingInstUrl}
          className="rounded-lg bg-[#8caf59] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#769c48] disabled:opacity-50"
        >
          {savingInstUrl ? "저장 중..." : "저장"}
        </button>
      </div>
    </div>
  )}
</div>

      </div>
    )}
  </div>

  

{/* 가사 영역 */}
<div className="overflow-hidden rounded-2xl border border-[#dce8c6] bg-white">

  <button
    type="button"
    onClick={() => setLyricsExpanded(!lyricsExpanded)}
    className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-[#f7f9f0]"
  >
    <div>
      <h3 className="font-bold text-[#416b36]">
        ♬ 가사
      </h3>
      <p className="mt-1 text-xs text-[#82936e]">
        {songMediaModal.lyrics?.trim()
          ? "등록된 가사"
          : "등록된 가사가 없습니다."}
      </p>
    </div>

    <div className="flex shrink-0 items-center gap-3">
      {isAdmin && (
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!isEditingLyrics) {
              setLyricsDraft(songMediaModal.lyrics || "");
              setLyricsExpanded(true);
            }
            setIsEditingLyrics(!isEditingLyrics);
          }}
          className="rounded-lg border border-[#dce8c6] bg-white px-3 py-2 text-xs font-bold text-[#416b36] transition hover:bg-[#edf5df]"
        >
          {isEditingLyrics ? "수정 취소" : "✏️ 가사 수정"}
        </span>
      )}

      <span className="text-lg text-[#8caf59]">
        {lyricsExpanded ? "−" : "+"}
      </span>
    </div>
  </button>

  {lyricsExpanded && (
    <div className="border-t border-[#e4efd5]">

      {/* 가사 수정 모드 */}
      {isAdmin && isEditingLyrics ? (
        <div className="p-4">
          <textarea
            value={lyricsDraft}
            onChange={(e) => setLyricsDraft(e.target.value)}
            placeholder="가사를 입력하세요."
            rows={14}
            className="w-full resize-y rounded-xl border border-[#dce8c6] px-4 py-3 text-sm leading-7 text-[#526348] outline-none focus:border-[#8caf59]"
          />

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditingLyrics(false)}
              className="rounded-lg border border-[#dce8c6] px-3 py-2 text-xs text-[#82936e]"
            >
              취소
            </button>

            <button
              type="button"
              onClick={handleSaveLyrics}
              disabled={savingLyrics}
              className="rounded-lg bg-[#8caf59] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#769c48] disabled:opacity-50"
            >
              {savingLyrics ? "저장 중..." : "가사 저장"}
            </button>
          </div>
        </div>
      ) : songMediaModal.lyrics?.trim() ? (
        <div className="max-h-[55vh] overflow-y-auto px-5 py-5 md:max-h-[460px]">
          <p className="whitespace-pre-wrap break-words text-sm leading-8 text-[#526348]">
            {songMediaModal.lyrics}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
          <span className="text-3xl text-[#dce8c6]">♫</span>
          <p className="text-sm text-[#82936e]">
            등록된 가사가 없어요.
          </p>
          <button
            type="button"
            onClick={() =>
              window.open(
                `https://www.google.com/search?q=${encodeURIComponent(
                  `${songMediaModal.title} ${songMediaModal.artist} 가사`
                )}`,
                "_blank",
                "noopener,noreferrer"
              )
            }
            className="rounded-xl bg-[#8caf59] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#769c48]"
          >
            구글에서 가사 검색
          </button>
        </div>
      )}
    </div>
  )}
</div>

</div>


      {/* 하단 */}
      <div className="flex items-center justify-between border-t border-[#e4efd5] bg-[#f7f9f0] px-5 py-3">
        <span className="text-xs font-medium text-[#a0ad91]">
          SANGCHU SONGBOOK
        </span>
        <button
          type="button"
          onClick={() => setSongMediaModal(null)}
          className="rounded-lg border border-[#dce8c6] bg-white px-4 py-2 text-xs font-bold text-[#416b36] hover:bg-[#edf5df]"
        >
          닫기
        </button>
      </div>
    </div>
  </div>
)}

      {/* 수정 모달 */}
      {editingSong && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/40 px-4 py-6">
  <div className="mx-auto my-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold">
              노래 수정
            </h2>

            <p className="mt-1 text-sm text-[#82936e]">
              노래 정보를 수정해주세요.
            </p>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-semibold">
                노래 제목
              </label>

              <input
                value={editTitle}
                onChange={(e) =>
                  setEditTitle(
                    e.target.value
                  )
                }
                className="w-full rounded-xl border border-[#dce8c6] bg-[#f7f9f0] px-4 py-3 text-sm outline-none focus:border-[#8caf59]"
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold">
                아티스트
              </label>

              <input
                value={editArtist}
                onChange={(e) =>
                  setEditArtist(
                    e.target.value
                  )
                }
                className="w-full rounded-xl border border-[#dce8c6] bg-[#f7f9f0] px-4 py-3 text-sm outline-none focus:border-[#8caf59]"
              />
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold">
                카테고리
              </label>
              <p className="mb-3 text-xs text-[#82936e]">
                여러 개를 선택할 수 있습니다.
              </p>
              <div className="flex flex-wrap gap-2">
                {categoryList.map((categoryItem) => {
                  const category = categoryItem.name;
                  const selected = editCategory.includes(category);
                  return (
                    <button
                      key={categoryItem.id}
                      type="button"
                      onClick={() => toggleEditCategory(category)}
                      className={
                        selected
                          ? "rounded-full border border-[#8caf59] bg-[#8caf59] px-3 py-2 text-sm text-white"
                          : "rounded-full border border-[#dce8c6] bg-white px-3 py-2 text-sm text-[#416b36] hover:bg-[#f7f9f0]"
                      }
                    >
                      {selected && "✓ "}
                      {category}
                    </button>
                  );
                })}
              </div>
              {editCategory.length > 0 && (
                <p className="mt-2 text-xs text-[#82936e]">
                  선택됨: {editCategory.join(", ")}
                </p>
              )}
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold">
                난이도
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEditDifficulty(
                      null
                    )
                  }
                  className={
                    editDifficulty === null
                      ? "flex-1 rounded-xl border border-[#8caf59] bg-[#8caf59] py-2 text-sm text-white"
                      : "flex-1 rounded-xl border border-[#dce8c6] py-2 text-sm text-[#82936e]"
                  }
                >
                  선택 안 함
                </button>

                {[1, 2, 3, 4, 5].map(
                  (star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() =>
                        setEditDifficulty(
                          star
                        )
                      }
                      className={
                        editDifficulty ===
                        star
                          ? "flex-1 rounded-xl border border-[#8caf59] bg-[#8caf59] py-2 text-sm text-white"
                          : "flex-1 rounded-xl border border-[#dce8c6] bg-white py-2 text-sm"
                      }
                    >
                      {"⭐".repeat(
                        star
                      )}
                    </button>
                  )
                )}
              </div>
            </div>
{/* INST / MR 링크 */}
<div className="mt-4">
  <label className="mb-2 block text-sm font-semibold">
    INST / MR 링크
  </label>
  <input
    type="url"
    value={editInstUrl}
    onChange={(e) => setEditInstUrl(e.target.value)}
    placeholder="YouTube 또는 INST 영상 주소"
    className="w-full rounded-xl border border-[#dce8c6] bg-[#f7f9f0] px-4 py-3 text-sm outline-none focus:border-[#8caf59]"
  />
  <p className="mt-1 text-xs text-[#82936e]">
    입력한 주소는 앨범 커버의 INST 버튼에 연결됩니다.
  </p>
</div>

{/* 가사 */}
<div className="mt-4">
  <label className="mb-2 block text-sm font-semibold">
    노래 가사
  </label>
  <textarea
    value={editLyrics}
    onChange={(e) => setEditLyrics(e.target.value)}
    rows={8}
    placeholder="가사를 직접 입력해주세요. 줄바꿈도 그대로 표시됩니다."
    className="w-full resize-y rounded-xl border border-[#dce8c6] bg-[#f7f9f0] px-4 py-3 text-sm leading-6 outline-none focus:border-[#8caf59]"
  />
</div>
            <div className="mt-6 flex gap-2">
              <button
                onClick={closeEdit}
                disabled={savingEdit}
                className="flex-1 rounded-xl border border-[#dce8c6] px-4 py-3 text-sm font-medium text-[#8caf59] transition hover:bg-[#f7f9f0] disabled:opacity-50"
              >
                취소
              </button>

              <button
                onClick={handleEdit}
                disabled={savingEdit}
                className="flex-1 rounded-xl bg-[#8caf59] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#739b45] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingEdit
                  ? "저장 중..."
                  : "수정 저장"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 본문 */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)] xl:gap-8">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start lg:pr-1">
{/* 공지사항 미니 카드 */}
<button
  type="button"
  onClick={() => {
    setNoticeOpen(true);
    setNoticeEditing(false);
  }}
  className="mb-2 w-full rounded-xl border border-[#dce8c6] bg-white px-3 py-2 text-left shadow-sm transition hover:border-[#a9c98b] hover:shadow-md"
>
  <div className="flex items-center justify-between gap-2">
    <span className="text-sm font-bold text-[#416b36]">
      📢 {notice.title || "노래책 필독사항"}
    </span>
    <span className="shrink-0 rounded-full bg-[#e4efd5] px-2 py-1 text-[10px] font-bold text-[#8caf59]">
      공지
    </span>
  </div>

  <div className="mt-1 flex items-center justify-between">
    <span className="text-xs text-[#82936e]">
      공지 내용 확인하기
    </span>
    <span className="text-xs text-[#8caf59]">자세히 보기 →</span>
  </div>
</button>

{/* 검색 */}
        <div className="mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="노래 제목이나 아티스트 검색..."
            className="w-full rounded-xl border border-[#dce8c6] bg-white/90 px-3 py-2.5 text-sm outline-none shadow-sm transition placeholder:text-[#a0ad91] focus:border-[#8caf59] focus:ring-2 focus:ring-[#8caf59]/10"
          />
        </div>

        {/* 필터 */}
        <div className="rounded-2xl border border-[#dce8c6] bg-white/85 p-3 shadow-sm">
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black tracking-wide text-[#416b36]">카테고리</p>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowCategoryManager((current) => !current)}
                  className="rounded-lg border border-[#dce8c6] bg-[#f7f9f0] px-3 py-1.5 text-xs font-medium text-[#8caf59] hover:bg-[#edf5df]"
                >
                  ⚙️ 카테고리 관리 {showCategoryManager ? "닫기" : ""}
                </button>
              )}
            </div>

            {showCategoryManager && isAdmin && (
              <div className="mb-4 rounded-xl border border-[#dce8c6] bg-[#f7fbf8] p-4">
                <p className="mb-3 text-sm font-semibold text-[#416b36]">카테고리 관리</p>

                <div className="mb-4 flex gap-2">
                  <input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAddCategory();
                      }
                    }}
                    placeholder="새 카테고리 이름"
                    className="min-w-0 flex-1 rounded-lg border border-[#dce8c6] bg-white px-3 py-2 text-sm outline-none focus:border-[#8caf59]"
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddCategory()}
                    disabled={savingCategory || !newCategoryName.trim()}
                    className="shrink-0 rounded-lg bg-[#8caf59] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#739b45] disabled:opacity-50"
                  >
                    추가
                  </button>
                </div>

               <div className="space-y-2">
  {categoryList.map((category, index) => (
    <div
      key={category.id}
      className="flex flex-wrap items-center gap-2 rounded-lg border border-[#e4efd5] bg-white p-2"
    >
      {editingCategoryName === category.name ? (
        <>
          <input
            autoFocus
            value={categoryEditValue}
            onChange={(e) => setCategoryEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleRenameCategory(category.name);
              }

              if (e.key === "Escape") {
                setEditingCategoryName(null);
                setCategoryEditValue("");
              }
            }}
            className="min-w-0 flex-1 rounded-lg border border-[#dce8c6] px-3 py-2 text-sm outline-none focus:border-[#8caf59]"
          />

          <button
            type="button"
            onClick={() => void handleRenameCategory(category.name)}
            disabled={savingCategory}
            className="rounded-lg bg-[#8caf59] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            저장
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingCategoryName(null);
              setCategoryEditValue("");
            }}
            className="rounded-lg border border-[#dce8c6] px-3 py-2 text-xs text-[#82936e]"
          >
            취소
          </button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 px-2 text-sm font-medium text-[#416b36]">
            {category.name}
          </span>

          {/* 위로 이동 */}
          <button
            type="button"
            onClick={() =>
              void handleMoveCategory(category.id, "up")
            }
            disabled={savingCategory || index === 0}
            className="rounded-lg border border-[#dce8c6] px-3 py-2 text-sm text-[#8caf59] hover:bg-[#f7f9f0] disabled:cursor-not-allowed disabled:opacity-30"
            title="위로 이동"
          >
            ▲
          </button>

          {/* 아래로 이동 */}
          <button
            type="button"
            onClick={() =>
              void handleMoveCategory(category.id, "down")
            }
            disabled={
              savingCategory || index === categoryList.length - 1
            }
            className="rounded-lg border border-[#dce8c6] px-3 py-2 text-sm text-[#8caf59] hover:bg-[#f7f9f0] disabled:cursor-not-allowed disabled:opacity-30"
            title="아래로 이동"
          >
            ▼
          </button>

          <button
            type="button"
            onClick={() => {
              setEditingCategoryName(category.name);
              setCategoryEditValue(category.name);
            }}
            disabled={savingCategory}
            className="rounded-lg border border-[#dce8c6] px-3 py-2 text-xs text-[#8caf59] hover:bg-[#f7f9f0] disabled:opacity-50"
          >
            이름 변경
          </button>

          <button
            type="button"
            onClick={() => void handleDeleteCategory(category.name)}
            disabled={savingCategory}
            className="rounded-lg border border-[#ead7d7] px-3 py-2 text-xs text-[#b45d5d] hover:bg-[#fff4f4] disabled:opacity-50"
          >
            삭제
          </button>
        </>
      )}
    </div>
  ))}
</div>

                <p className="mt-3 text-xs leading-relaxed text-[#82936e]">
                  이름을 변경하면 기존 노래에도 반영됩니다. 삭제하면 기존 노래에서 해당 카테고리만 제거되고 노래는 유지됩니다.
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setCategoryFilter([])}
                className={
                  categoryFilter.length === 0
                    ? "rounded-full bg-[#8caf59] px-2.5 py-1.5 text-xs text-white"
                    : "rounded-full border border-[#dce8c6] bg-white px-2.5 py-1.5 text-xs text-[#416b36] hover:bg-[#f7f9f0]"
                }
              >전체</button>
              {categoryList.map((categoryItem) => {
                const category = categoryItem.name;
                const selected = categoryFilter.includes(category);
                return (
                  <button
                    key={categoryItem.id}
                    onClick={() => setCategoryFilter((prev) =>
                      selected ? prev.filter((item) => item !== category) : [...prev, category]
                    )}
                    className={
                      selected
                        ? "rounded-full bg-[#8caf59] px-2.5 py-1.5 text-xs text-white"
                        : "rounded-full border border-[#dce8c6] bg-white px-2.5 py-1.5 text-xs text-[#416b36] hover:bg-[#f7f9f0]"
                    }
                  >
  {selected && "✓ "}
  {category} ({categorySongCounts.get(category) ?? 0})
</button>
                );
              })}
            </div>
            {categoryFilter.length > 0 && (
              <p className="mt-2 text-xs text-[#82936e]">
                선택한 카테고리를 모두 포함하는 노래를 표시합니다.
              </p>
            )}
          </div>

         
{/* 가수 */}
<div>
  <div className="mb-2">
    <p className="text-xs font-black tracking-wide text-[#416b36]">
      가수
    </p>
  </div>

  <div className="flex flex-wrap gap-2">
    {/* 전체 */}
    <button
      type="button"
      onClick={() => setArtistFilter(new Set())}
      className={
        artistFilter.size === 0
          ? "rounded-full bg-[#8caf59] px-2.5 py-1.5 text-xs text-white"
          : "rounded-full border border-[#dce8c6] bg-white px-2.5 py-1.5 text-xs text-[#416b36] hover:bg-[#f7f9f0]"
      }
    >
      전체
    </button>

    {/* 노래가 많은 가수 8명 */}
    {visibleArtists.slice(0, 8).map((artist) => {
      const selected = artistFilter.has(artist);

      return (
        <button
          key={artist}
          type="button"
          onClick={() =>
            setArtistFilter((current) => {
              const next = new Set(current);

              if (next.has(artist)) {
                next.delete(artist);
              } else {
                next.add(artist);
              }

              return next;
            })
          }
          className={
            selected
              ? "rounded-full bg-[#8caf59] px-2.5 py-1.5 text-xs text-white"
              : "rounded-full border border-[#dce8c6] bg-white px-2.5 py-1.5 text-xs text-[#416b36] hover:bg-[#f7f9f0]"
          }
        >
          {selected && "✓ "}
          {artist}
          <span className={selected ? "ml-1 text-white/80" : "ml-1 text-[#82936e]"}>
            {artistSongCounts.get(artist) ?? 0}
          </span>
        </button>
      );
    })}

    {/* 전체 가수 모달 */}
    {allArtists.length > 8 && (
      <button
        type="button"
        onClick={() => {
          setArtistModalSearch("");
          setArtistModalOpen(true);
        }}
        className="rounded-full border border-dashed border-[#a9c9b4] bg-[#f7f9f0] px-2.5 py-1.5 text-xs font-medium text-[#8caf59] hover:bg-[#edf5df]"
      >
        전체 보기 +{allArtists.length - 8}
      </button>
    )}
  </div>

  {artistFilter.size > 0 && (
    <p className="mt-2 text-xs text-[#82936e]">
      선택한 가수: {Array.from(artistFilter).join(", ")}
    </p>
  )}
</div>


          <div className="mt-3">
            <p className="mb-2 text-xs font-black tracking-wide text-[#416b36]">
              난이도
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  setDifficultyFilter(
                    null
                  )
                }
                className={
                  difficultyFilter ===
                  null
                    ? "rounded-full bg-[#8caf59] px-2.5 py-1.5 text-xs text-white"
                    : "rounded-full border border-[#dce8c6] bg-white px-2.5 py-1.5 text-xs text-[#416b36] hover:bg-[#f7f9f0]"
                }
              >
                전체
              </button>

              {[1, 2, 3, 4, 5].map(
                (difficulty) => (
                  <button
                    key={difficulty}
                    onClick={() =>
                      setDifficultyFilter(
                        difficulty
                      )
                    }
                    className={
                      difficultyFilter ===
                      difficulty
                        ? "rounded-full bg-[#8caf59] px-2.5 py-1.5 text-xs text-white"
                        : "rounded-full border border-[#dce8c6] bg-white px-2.5 py-1.5 text-xs text-[#416b36] hover:bg-[#f7f9f0]"
                    }
                  >
                    {"⭐".repeat(
                      difficulty
                    )}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
        </aside>

        <div className="min-w-0">
{/* 공용 Queue */}
<QueuePanel songs={songs} isAdmin={isAdmin} />

        {/* 제목 + 정렬 + 보기 */}
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">
              내 노래책
            </h2>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e4efd5] px-3 py-1.5 text-sm font-medium text-[#8caf59]">
                🎵 전체 {songs.length}곡
              </span>

              {filteredSongs.length !==
                songs.length && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#dce8c6] bg-white px-3 py-1.5 text-sm text-[#82936e]">
                  현재{" "}
                  {
                    filteredSongs.length
                  }
                  곡
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* 정렬 */}
            <select
              value={sortMode}
              onChange={(e) =>
                setSortMode(
                  e.target.value as
                    | "latest"
                    | "artist"
                    | "title"
                    | "popular"
                )
              }
              className="rounded-xl border border-[#dce8c6] bg-white px-4 py-2.5 text-sm font-medium text-[#8caf59] outline-none transition hover:bg-[#edf5df] focus:border-[#8caf59]"
            >
              <option value="latest">
                🆕 최신순
              </option>

              <option value="artist">
                🎤 가수 가나다순
              </option>

              <option value="title">
                🎵 제목 가나다순
              </option>

              <option value="popular">
                ❤️ 인기순
              </option>
            </select>

            {/* 보기 전환 */}
            <div className="flex rounded-xl border border-[#dce8c6] bg-white p-1">
              <button
                onClick={() =>
                  setViewMode("grid")
                }
                className={
                  viewMode === "grid"
                    ? "rounded-lg bg-[#8caf59] px-3 py-2 text-sm font-medium text-white shadow-sm"
                    : "rounded-lg px-3 py-2 text-sm text-[#8caf59] transition hover:bg-[#edf5df]"
                }
              >
                ▦ 블럭
              </button>

              <button
                onClick={() =>
                  setViewMode("list")
                }
                className={
                  viewMode === "list"
                    ? "rounded-lg bg-[#8caf59] px-3 py-2 text-sm font-medium text-white shadow-sm"
                    : "rounded-lg px-3 py-2 text-sm text-[#8caf59] transition hover:bg-[#edf5df]"
                }
              >
                ☰ 리스트
              </button>
            </div>
          </div>
        </div>

        {/* 커버 검색 진행 표시 */}
        {updatingCovers && (
          <div className="mb-5 rounded-2xl border border-[#dce8c6] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[#416b36]">
                  🖼️ 앨범 커버를 찾고 있어요
                </p>

                <p className="mt-1 text-xs text-[#789786]">
                  Bugs → YouTube 순서로
                  검색하고 있습니다.
                </p>
              </div>

              <span className="text-sm font-bold text-[#8caf59]">
                {
                  coverProgress.processed
                }
                /
                {
                  coverProgress.total
                }
              </span>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e4efd5]">
              <div
                className="h-full rounded-full bg-[#8caf59] transition-all duration-300"
                style={{
                  width:
                    coverProgress.total >
                    0
                      ? String(
                          (coverProgress.processed /
                            coverProgress.total) *
                            100
                        ) + "%"
                      : "0%",
                }}
              />
            </div>
          </div>
        )}

  {/* 노래 목록 */}



        {/* 노래 목록 */}
        <div
          className={
            viewMode === "grid"
              ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
              : "grid gap-4"
          }
        >
          {sortedSongs.map(
            (song) => {
              const isLiked =
                likedSongs[
                  song.id
                ];

              const likes =
                likeCounts[
                  song.id
                ] || 0;

              const isAnimating =
                animatingLike ===
                song.id;

              return (
                <div
                  key={song.id}
                  className={
                    viewMode === "grid"
                      ? "group relative flex min-h-[360px] w-full flex-col overflow-hidden rounded-2xl border border-[#dce8c6] bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-[#dce8c6] hover:shadow-md"
                      : "group relative flex w-full items-center justify-between overflow-hidden rounded-2xl border border-[#dce8c6] bg-white p-4 pr-20 shadow-sm transition hover:-translate-y-0.5 hover:border-[#dce8c6] hover:shadow-md"
                  }
                >
                  {/* 블럭형 커버 */}
                  {viewMode ===
                    "grid" && (
                    <div className="relative aspect-square w-full overflow-hidden bg-[#f7f9f0]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSongQueueAction(song);
                        }}
                        disabled={!!processingSongIds[song.id] || (!isAdmin && (!userId || !!requestedSongIds[song.id]))}
                        className="absolute left-2 top-2 z-20 rounded-lg border border-white/70 bg-white/95 px-3 py-2 text-xs font-bold text-[#8caf59] shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        {processingSongIds[song.id]
                          ? "처리 중..."
                          : isAdmin
                            ? "+ Queue 추가"
                            : requestedSongIds[song.id]
                              ? "✓ 요청 완료"
                              : "🎤 요청"}
                      </button>
                      {song.cover_url ? (
                        <img
                          src={
                            song.cover_url
                          }
                          alt={
                            song.title +
                            " 앨범 커버"
                          }
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <div className="text-center">
                            <div className="text-5xl text-[#dce8c6]">
                              ♪
                            </div>

                            <p className="mt-2 text-xs text-[#a0ad91]">
                              커버 없음
                            </p>
                          </div>
                        </div>
                      )}
                    {/* 표지 하단 버튼 */}
<div className="absolute bottom-0 left-0 right-0 z-20 flex">
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      handleInstAction(song);
    }}
    className="flex-1 bg-white/95 px-1 py-2 text-center text-[10px] font-bold text-[#416b36] transition hover:bg-[#edf5df]"
  >
    ▶ INST {song.inst_url?.trim() ? "재생" : "검색"}
  </button>

  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      handleLyricsAction(song);
    }}
    className="flex-1 border-l border-[#dce8c6] bg-white/95 px-1 py-2 text-center text-[10px] font-bold text-[#416b36] transition hover:bg-[#edf5df]"
  >
    ♬ 가사 {song.lyrics?.trim() ? "보기" : "검색"}
  </button>
</div>
                    </div>
                  )}

                  {/* 리스트형 커버 */}
                  {viewMode ===
                    "list" && (
                    <div className="relative mr-4 h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-[#f7f9f0]">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSongQueueAction(song);
                        }}
                        disabled={!!processingSongIds[song.id] || (!isAdmin && (!userId || !!requestedSongIds[song.id]))}
                        aria-label={isAdmin ? `${song.title} Queue 추가` : `${song.title} 요청`}
                        className="absolute inset-x-0 top-0 z-20 bg-white/95 px-1 py-1.5 text-[10px] font-bold leading-tight text-[#8caf59] shadow-sm disabled:opacity-70"
                      >
                        {processingSongIds[song.id]
                          ? "처리 중"
                          : isAdmin
                            ? "+ 추가"
                            : requestedSongIds[song.id]
                              ? "✓ 요청됨"
                              : "🎤 요청"}
                      </button>
                      {song.cover_url ? (
                        <img
                          src={
                            song.cover_url
                          }
                          alt={
                            song.title +
                            " 앨범 커버"
                          }
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <span className="text-2xl text-[#dce8c6]">
                            ♪
                          </span>
                        </div>
                      )}
                      
                    </div>
                  )}

                  {/* 노래 정보 */}
<div
  className={
    viewMode === "grid"
      ? "min-w-0 flex-1 p-4"
      : "flex min-w-0 flex-1 items-center"
  }
>
  {/* 제목 및 아티스트 */}
  <div className="min-w-0 flex-1">
    <h3 className="truncate font-bold">
      {song.title}
    </h3>

    <p className="whitespace-normal break-words leading-snug text-[#82936e]">
      {song.artist}
    </p>

    <div className="mt-2 flex flex-wrap gap-1.5">
      {parseCategories(song.category).map((category) => (
        <span
          key={category}
          className="rounded-full bg-[#e4efd5] px-2.5 py-1 text-xs text-[#8caf59]"
        >
          {category}
        </span>
      ))}

      {song.difficulty && (
        <span className="rounded-full bg-[#f7f9f0] px-2.5 py-1 text-xs text-[#8caf59]">
          {"⭐".repeat(song.difficulty)}
        </span>
      )}
    </div>

    {/* 관리자 버튼 */}
    {isAdmin && (
      <div
        className={
          viewMode === "grid"
            ? "mt-4 flex flex-wrap items-center gap-2"
            : "mt-3 flex flex-wrap items-center gap-2"
        }
      >
        <button
          onClick={() => openEdit(song)}
          className="rounded-lg border border-[#dce8c6] px-3 py-1.5 text-xs font-medium text-[#8caf59] transition hover:bg-[#f7f9f0]"
        >
          ✏️ 수정
        </button>

        {song.cover_url && (
          <button
            onClick={() =>
              handleDeleteCover(song.id, song.title)
            }
            className="rounded-lg border border-[#dce8c6] px-3 py-1.5 text-xs font-medium text-[#82936e] transition hover:bg-[#f7f9f0]"
          >
            🖼️ 커버 삭제
          </button>
        )}

        <button
          onClick={() =>
            handleDelete(song.id, song.title)
          }
          className="rounded-lg border border-[#dce8c6] px-3 py-1.5 text-xs font-medium text-[#7965b4] transition hover:bg-[#f0ebfb]"
        >
          삭제
        </button>
      </div>
    )}
  </div>

  {/* 리스트형 전용 INST / 가사 버튼 */}
  {viewMode === "list" && (
    <div className="ml-5 mr-12 flex shrink-0 flex-col gap-2">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleInstAction(song);
        }}
        className="w-[100px] rounded-lg border border-[#dce8c6] bg-[#f7f9f0] px-2 py-2 text-xs font-bold text-[#416b36] transition hover:bg-[#edf5df]"
      >
        ▶ INST {song.inst_url?.trim() ? "재생" : "검색"}
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleLyricsAction(song);
        }}
        className="w-[100px] rounded-lg border border-[#dce8c6] bg-[#f7f9f0] px-2 py-2 text-xs font-bold text-[#416b36] transition hover:bg-[#edf5df]"
      >
        ♬ 가사 {song.lyrics?.trim() ? "보기" : "검색"}
      </button>
    </div>
  )}
</div>

                  {/* 좋아요 */}
<button
  onClick={() =>
    handleLike(song.id)
  }
  className={
    viewMode === "grid"
      ? "absolute bottom-11 right-2 flex flex-col items-center justify-center rounded-2xl px-3 py-2 transition " +
        (isLiked
          ? "bg-[#f6f2ff]"
          : "bg-transparent hover:bg-[#f7f9f0]")
      : "absolute right-4 top-1/2 flex -translate-y-1/2 flex-col items-center justify-center rounded-2xl px-3 py-2 transition " +
        (isLiked
          ? "bg-[#f6f2ff]"
          : "bg-transparent hover:bg-[#f7f9f0]")
  }
  aria-label={
    isLiked
      ? "좋아요 취소"
      : "좋아요"
  }
>
  <span
    className={
      "transition-transform duration-300 " +
      (isAnimating
        ? "scale-125"
        : "scale-100")
    }
  >
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill={
        isLiked
          ? "#9b85d2"
          : "none"
      }
      stroke={
        isLiked
          ? "#9b85d2"
          : "#a0ad91"
      }
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.8 8.7c0 5.2-8.8 10.1-8.8 10.1S3.2 13.9 3.2 8.7C3.2 5.8 5.3 4 7.8 4c1.5 0 2.9.7 4.2 2 1.3-1.3 2.7-2 4.2-2 2.5 0 4.6 1.8 4.6 4.7Z" />
    </svg>
  </span>

  <span
    className={
      "mt-0.5 text-xs font-semibold " +
      (isLiked
        ? "text-[#9b85d2]"
        : "text-[#a0ad91]")
    }
  >
    {likes}
  </span>
</button>
                </div>
              );
            }
          )}
        </div>

        {/* 검색 결과 없음 */}
        {sortedSongs.length ===
          0 && (
          <div className="py-16 text-center">
            <div className="text-4xl">
              🔍
            </div>

            <p className="mt-4 font-medium">
              검색 결과가 없어요
            </p>

            <p className="mt-1 text-sm text-[#82936e]">
              다른 제목이나 아티스트를
              검색해보세요.
            </p>
          </div>
        )}
        </div>
        </div>
      </section>

      <footer className="mx-auto max-w-7xl px-6 py-10 text-center text-xs text-[#a0ad91]">
        SANGCHU SONGBOOK
      </footer>
    </main>
  );
}