enum eMissionSavedState
{
    E_MISSION_NONE=0,
    E_MISSION_NEW=1,
    E_MISSION_UPDATE=2,
    E_MISSION_DELETE=3
};
enum eMissionType
{
    eMissionTypeNonRandom=-1,
    eMissionTypeDestroy=0,
    eMissionTypeDefend=1,
    eMissionTypeEscort=2,
    eMissionTypeRace=3,
    eMissionTypeSneak=4,
    eMissionTypeSpy=5,
    eMissionTypeDeliver=6,
    eMissionTypeCollect=7,
    eMissionTypePickup=8,
    eMissionTypeCraft=9,
    eMissionTypeNumTypes=10
};
enum eMissionMode
{
    E_MISSIONMODE_NORMAL=0,
    E_MISSIONMODE_CRAZYTAXI=1,
    E_MISSIONMODE_RAMPAGE=2,
    E_MISSIONMODE_SURIVIOR=3,
    E_MISSIONMODE_NUM_MODES=4
};



// SMSG_Base contains opcode and usually 4 bytes of padding
struct SMSG_Global_ConvoyActiveMission : public SMSG_Base// Size=0x18 (Id=15523) 
{
    int coidChanger;// Offset=0x8 Size=0x8
    unsigned int uiMissionID;// Offset=0x10 Size=0x2
};

struct SMSG_Sector_FailMission : public SMSG_Sector_Base// Size=0x18 (Id=16640)
{
    int coidCharacter;// Offset=0x8 Size=0x8
    int IDMission;// Offset=0x10 Size=0x4
};

struct SMSG_Sector_MissionDialog : public SMSG_Sector_Base// Size=0x160 (Id=16686)
{
    struct TFID fidCreature;// Offset=0x8 Size=0x10
    unsigned int ucNumMissions;// Offset=0x18 Size=0x1
    enum EMax_Missions
    {
        MAX_MISSIONS=8
    };
    struct SMissionInfo// Size=0x28 (Id=24735)
    {
        long IDMission;// Offset=0x0 Size=0x4
        int arrCOIDPossibleItems[4];// Offset=0x8 Size=0x20
    };
    struct SMSG_Sector_MissionDialog::SMissionInfo missions[8];// Offset=0x20 Size=0x140
};

struct SMSG_Sector_MissionDialog_Response : public SMSG_Sector_Base// Size=0x20 (Id=17925)
{
    long IDMission;// Offset=0x4 Size=0x4
    int mixedVar;// Offset=0x8 Size=0x8
    struct TFID fidMissionGiver;// Offset=0x10 Size=0x10
};

struct SMSG_Global_ConvoyMissionsResponse : public SMSG_Base// Size=0x18 (Id=18220)
{
    int coidMember;// Offset=0x8 Size=0x8
    unsigned int uiNumMissions;// Offset=0x10 Size=0x2
    unsigned int * arruiMissionIDs;// Offset=0x14 Size=0x4
};

enum eMissionStringType
{
    eMissionStringTypeObjective=0,
    eMissionStringTypeJournalTopic=1,
    eMissionStringTypeJournalEntry=2,
    eMissionStringTypeNumberTypes=3
};