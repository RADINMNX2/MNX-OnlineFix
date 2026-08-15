#pragma once
#include <cstdint>

// --- Basic Steam Types ---
using SteamAPICall_t = uint64_t;
enum ELobbyType { k_ELobbyTypePrivate = 0, k_ELobbyTypeFriendsOnly = 1, k_ELobbyTypePublic = 2, k_ELobbyTypeInvisible = 3 };

class CSteamID {
public:
    uint64_t m_steamid;
    CSteamID() : m_steamid(0) {}
    CSteamID(uint64_t id) : m_steamid(id) {}
};

enum EP2PSend {
    k_EP2PSendUnreliable = 0,
    k_EP2PSendUnreliableNoDelay = 1,
    k_EP2PSendReliable = 2,
    k_EP2PSendReliableWithBuffering = 3,
};

// --- Mocked Interfaces ---
// These interfaces define the functions we will intercept or mock.

class ISteamNetworking {
public:
    virtual bool SendP2PPacket(CSteamID steamIDRemote, const void* pubData, uint32_t cubData, EP2PSend eP2PSendType, int nChannel = 0) = 0;
    virtual bool IsP2PPacketAvailable(uint32_t* pcubMsgSize, int nChannel = 0) = 0;
    virtual bool ReadP2PPacket(void* pubDest, uint32_t cubDest, uint32_t* pcubMsgSize, CSteamID* psteamIDRemote, int nChannel = 0) = 0;
    virtual bool AcceptP2PSessionWithUser(CSteamID steamIDRemote) = 0;
};

class ISteamMatchmaking {
public:
    virtual SteamAPICall_t CreateLobby(ELobbyType eLobbyType, int cMaxMembers) = 0;
    // ... other matchmaking functions can be added here
};

// --- Dummy Interfaces for compatibility ---
// These classes are empty but necessary for the game to find the interfaces.
class ISteamUser {
public:
    virtual CSteamID GetSteamID() = 0;
};

class ISteamFriends {
public:
    virtual const char *GetPersonaName() = 0;
    virtual int GetFriendAvatar(CSteamID steamIDFriend, int eAvatarSize) = 0;
};
class ISteamUtils {
public:
    virtual bool GetImageSize(int iImage, uint32_t *punWidth, uint32_t *punHeight) = 0;
    virtual bool GetImageRGBA(int iImage, uint8_t *pubDest, int nDestBufferSize) = 0;
};
class ISteamUserStats {};
class ISteamApps {};
class ISteamInventory {};
class ISteamRemoteStorage {};
