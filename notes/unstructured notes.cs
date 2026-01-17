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

struct SMSG_Sector_RequestCastSkill : public SMSG_Sector_Base// Size=0x28 (Id=5659)
{
    struct TFID fidTarget;// Offset=0x8 Size=0x10
    long lSkillID;// Offset=0x18 Size=0x4
    class CNDUnalignedVector3 nduavTargetPosition;// Offset=0x1c Size=0xc
    void SMSG_Sector_RequestCastSkill();
};

struct SMSG_Sector_SkillStatusEffect : public SMSG_Sector_Base// Size=0x9a0 (Id=16377)
{
    unsigned int uiSize;// Offset=0x4 Size=0x2
    long lSkillID;// Offset=0x8 Size=0x4
    int iSkillLevel;// Offset=0xc Size=0x2
    long lDelayTime;// Offset=0x10 Size=0x4
    unsigned int ucErrorCode;// Offset=0x14 Size=0x1
    class CNDUnalignedVector3 nduavTargetPosition;// Offset=0x18 Size=0xc
    struct TFID fidSource;// Offset=0x28 Size=0x10
    bool bIsItemSkill;// Offset=0x38 Size=0x1
    int lDiceSeed;// Offset=0x3c Size=0x4
    struct sSkillTargetInfo// Size=0x18 (Id=24883)
    {
        struct TFID fid;// Offset=0x0 Size=0x10
        int lMana;// Offset=0x10 Size=0x2
        int lMaxMana;// Offset=0x12 Size=0x2
    };
    struct SMSG_Sector_SkillStatusEffect::sSkillTargetInfo arrTargets[100];// Offset=0x40 Size=0x960
    void SMSG_Sector_SkillStatusEffect();
};

struct SMSG_Sector_CancelSkill : public SMSG_Sector_Base// Size=0x20 (Id=15203)
{
    struct TFID fidTarget;// Offset=0x8 Size=0x10
    long lSkillID;// Offset=0x18 Size=0x4
};

enum eSkillResponses
{
    SKILL_RESPONSE_OK=0,
    SKILL_RESPONSE_SERVER_CHECKS_FAILED=1,
    SKILL_RESPONSE_GENERIC_FAILED=2,
    SKILL_RESPONSE_CORPSE=3,
    SKILL_RESPONSE_POWER=4,
    SKILL_RESPONSE_STATUS=5,
    SKILL_RESPONSE_BUSY=6,
    SKILL_RESPONSE_RECHARGE=7,
    SKILL_RESPONSE_SUMMONCOUNT=8,
    SKILL_RESPONSE_NOAIR=9,
    SKILL_RESPONSE_EXCLUSIVE=10,
    SKILL_RESPONSE_NEEDSTEALTH=11,
    SKILL_RESPONSE_NOSTEALTH=12,
    SKILL_RESPONSE_RANGE=13,
    SKILL_RESPONSE_FACTION=14,
    SKILL_RESPONSE_AI_DIDNT_CAST=15,
    SKILL_RESPONSE_SUMMONCOUNT_TOTAL=16,
    SKILL_RESPONSE_CANCELLED_ACTIVE=17,
    SKILL_RESPONSE_TOO_SOON=18,
    SKILL_RESPONSE_DEATHCAST=99
};

enum ESkillTypes
{
    eSkillCommon=0,
    eSkillChain=1,
    eSkillCommonSlave=2,
    eSkillMaster=3,
    eSkillHarpoon=4,
    eSkillItemPaintCar=5,
    eSkillOnHit=6,
    eSkillSummonSnoop=7,
    eSkillTransmute=8,
    eSkillReflect=9,
    eSkillSummon=10,
    eSkillAEDOT=11,
    eSkillResurrect=12,
    eSkillOnDoHit=13,
    eSkillGuard=14,
    eSkillXP=15,
    eSkillConsume=16,
    eSkillCollision=17,
    eSkillChainInverse=18,
    eSkillTransform=19,
    eSkillTransfer=20,
    eSkillExplode=21,
    eSkillAura=22,
    eSkillVirus=23,
    eSkillAggregate=24,
    eSkillHitCharge=25,
    eSkillPossessCreature=26,
    eSkillOnDeath=27,
    eSkillOnKill=28,
    eSkillKillCharge=29,
    eSkillCommonCastOnDeath=30,
    eSkillOnHitPossessor=31,
    eSkillOnDoHitPossessor=32,
    eSkillAddSkills=33,
    eSkillAddSkillLevels=34,
    eSkillCommonLinked=35,
    eSkillOnHitLinked=36,
    eSkillTriggerActivate=37,
    eSkillActivateBonus=38
};

enum eSkillCategory
{
    CATEGORY_NONE=-1,
    CATEGORY_ALL_PLAYER=0,
    CATEGORY_BUFF=1,
    CATEGORY_DEBUFF=2,
    CATEGORY_DAMAGE=3,
    CATEGORY_REPAIR=4,
    CATEGORY_SUMMON=5,
    CATEGORY_MAX=6
};

struct SMSG_Sector_CreateSkillSummon : public SMSG_Sector_CreateSkillHeartbeat// Size=0x40 (Id=7914)
{
    unsigned int uiCasterLevel;// Offset=0x38 Size=0x2
    void SMSG_Sector_CreateSkillSummon();
};

struct SMSG_Sector_CreateSkillCommon : public SMSG_Sector_CreateSkillHeartbeat// Size=0x40 (Id=9034)
{
    bool bIgnoreDmg;// Offset=0x38 Size=0x1
    float fScalar;// Offset=0x3c Size=0x4
    void SMSG_Sector_CreateSkillCommon();
};

struct SMSG_Sector_SkillIncrement : public SMSG_Sector_Base// Size=0x8 (Id=10603)
{
    long lSkillID;// Offset=0x4 Size=0x4
};

struct SMSG_Sector_CreateSkillHeartbeat : public SMSG_Sector_Base// Size=0x38 (Id=17660)
{
    int lLastTickCount;// Offset=0x4 Size=0x4
    int lDiceSeed;// Offset=0x8 Size=0x4
    unsigned int lSkillID;// Offset=0xc Size=0x2
    int iSkillLevel;// Offset=0xe Size=0x2
    struct TFID fidTarget;// Offset=0x10 Size=0x10
    bool bForceDeath;// Offset=0x20 Size=0x1
    unsigned int lSkillType;// Offset=0x21 Size=0x1
    int lDurationCountdown;// Offset=0x22 Size=0x2
    struct TFID fidCaster;// Offset=0x28 Size=0x10
    enum __unnamed
    {
        INVALID_SKILL_TYPE=255,
        INVALID_SKILL_ID=65535
    };
    void SMSG_Sector_CreateSkillHeartbeat();
};

struct SMSG_Sector_CreateSkillPossess : public SMSG_Sector_CreateSkillHeartbeat// Size=0x58 (Id=20025)
{
    bool bNotified;// Offset=0x38 Size=0x1
    class CNDUnalignedVector3 ndPos;// Offset=0x3c Size=0xc
    class CNDUnalignedQuaternion ndRot;// Offset=0x48 Size=0x10
    void SMSG_Sector_CreateSkillPossess();// Offset=0x0 Size=0x3b
};

enum eSkillFireStatus
{
    SkillFireMiss=0,
    SkillFireHit=1
};

enum ESkillOptionalActions
{
    esoaNone=0,
    esoaResurrect=1,
    esoaPaint=2,
    esoaInvisible=3,
    esoaAnalyze=4,
    esoaTemplateSummon=5
};

enum ESkillElementTypes
{
    esetCost=1,
    esetPowerPerPulse=2,
    esetCoolDown=3,
    esetCastTime=4,
    esetDuration=5,
    esetFrequency=6,
    esetRange=7,
    esetTetherRange=8,
    esetSplashDamageRadius=9,
    esetHeal=10,
    esetMaxHP=11,
    esetPower=12,
    esetPowerCost=13,
    esetMaxPower=14,
    esetTaunt=15,
    esetArc=16,
    esetPhysical=17,
    esetFire=18,
    esetIce=19,
    esetCorrosion=20,
    esetSpirit=21,
    esetEnergy=22,
    esetAttribCombat=23,
    esetAttribTheory=24,
    esetAttribPerception=25,
    esetAttribTech=26,
    esetIdentify=27,
    esetCriticalHitCreature=28,
    esetCriticalHitVehicle=29,
    esetCriticalHitCreatureDefense=30,
    esetCriticalHitVehicleDefense=31,
    esetSummonCount=32,
    esetLevel=33,
    esetNumberOfTargets=34,
    esetConversionPercent=35,
    esetPercentSuccess=36,
    esetDrivingTerrain=37,
    esetWindForce=38,
    esetHeat=39,
    esetOptionalScalar1=40,
    esetOptionalScalar2=41,
    esetOffensivePercent=42,
    esetSkillPointCost=43,
    esetOptionalScalar3=44,
    esetBoost=45,
    esetSkillLevelsPerPlayerLevel=46,
    esetOffensiveBonus=47,
    esetDefensiveBonus=48,
    esetPenetrationBonus=49,
    esetDeflectionBonus=50,
    esetAISkillAttemptPercent=51,
    esetRangeMin=52,
    esetLootPercent=53,
    esetClinkPercent=54,
    esetClinkAmountPercent=55,
    esetLootEnhancePercent=56,
    esetHazardMode=57,
    esetShield=58,
    esetPoolTransferPowerToHP=59,
    esetPoolTransferPowerToHeat=60,
    esetAggroRadius=61,
    esetRefireRate=62,
    esetSkillCooldownType=63,
    esetSkillCooldownAmount=64,
    esetSkillDetectStealth=65,
    esetOptionalScalar4=66,
    esetDamageGuaranteed=67,
    esetPenetrationDamageAdd=68,
    esetCancelableStatusEffect=69,
    esetFlagDamageMin=65536,
    esetFlagDamageMax=131072,
    esetFlagDamageAddMin=262144,
    esetFlagDamageAddMax=524288,
    esetFlagDamageAddEquippedMin=1048576,
    esetFlagDamageAddEquippedMax=2097152,
    esetFlagResistDamage=4194304,
    esetFlagAccuracy=8388608
};

struct SMSG_Sector_CreateSkillCollision : public SMSG_Sector_CreateSkillHeartbeat// Size=0x48 (Id=21290)
{
    bool bCharged;// Offset=0x38 Size=0x1
    int lCharges;// Offset=0x3c Size=0x4
    bool bHasCharges;// Offset=0x40 Size=0x1
    void SMSG_Sector_CreateSkillCollision();
};

struct SMSG_Sector_CreateSkillOnHit : public SMSG_Sector_CreateSkillHeartbeat// Size=0x40 (Id=22386)
{
    long lMaxHP;// Offset=0x38 Size=0x4
    bool bHP;// Offset=0x3c Size=0x1
    void SMSG_Sector_CreateSkillOnHit();
};

struct SMSG_Sector_CreateSkillHitCharge : public SMSG_Sector_CreateSkillHeartbeat// Size=0x40 (Id=22551)
{
    int lStoredHits;// Offset=0x38 Size=0x4
    float fLastCharge;// Offset=0x3c Size=0x4
    void SMSG_Sector_CreateSkillHitCharge();
};

struct SMSG_Sector_CreateSkillKillCharge : public SMSG_Sector_CreateSkillHeartbeat// Size=0x48 (Id=22557)
{
    int lStoredHits;// Offset=0x38 Size=0x4
    float fLastCharge;// Offset=0x3c Size=0x4
    unsigned int lIndexRoll;// Offset=0x40 Size=0x4
    void SMSG_Sector_CreateSkillKillCharge();
};

struct SMSG_Sector_CreateSkillOnHitLinked : public SMSG_Sector_CreateSkillHeartbeat// Size=0x40 (Id=22567)
{
    bool bCharged;// Offset=0x38 Size=0x1
    unsigned int uiCharges;// Offset=0x3a Size=0x2
    void SMSG_Sector_CreateSkillOnHitLinked();
};

struct SMSG_Sector_CreateSkillVirus : public SMSG_Sector_CreateSkillHeartbeat// Size=0x40 (Id=22637)
{
    int lMaxJumps;// Offset=0x38 Size=0x4
    int lMaxPulses;// Offset=0x3c Size=0x4
    void SMSG_Sector_CreateSkillVirus();
};

enum ESkillTypes
{
    eSkillCommon=0,
    eSkillChain=1,
    eSkillCommonSlave=2,
    eSkillMaster=3,
    eSkillHarpoon=4,
    eSkillItemPaintCar=5,
    eSkillOnHit=6,
    eSkillSummonSnoop=7,
    eSkillTransmute=8,
    eSkillReflect=9,
    eSkillSummon=10,
    eSkillAEDOT=11,
    eSkillResurrect=12,
    eSkillOnDoHit=13,
    eSkillGuard=14,
    eSkillXP=15,
    eSkillConsume=16,
    eSkillCollision=17,
    eSkillChainInverse=18,
    eSkillTransform=19,
    eSkillTransfer=20,
    eSkillExplode=21,
    eSkillAura=22,
    eSkillVirus=23,
    eSkillAggregate=24,
    eSkillHitCharge=25,
    eSkillPossessCreature=26,
    eSkillOnDeath=27,
    eSkillOnKill=28,
    eSkillKillCharge=29,
    eSkillCommonCastOnDeath=30,
    eSkillOnHitPossessor=31,
    eSkillOnDoHitPossessor=32,
    eSkillAddSkills=33,
    eSkillAddSkillLevels=34,
    eSkillCommonLinked=35,
    eSkillOnHitLinked=36,
    eSkillTriggerActivate=37,
    eSkillActivateBonus=38
};

struct SMSG_Sector_CompleteDynamicObjective : public SMSG_Sector_Base// Size=0x18 (Id=16590)
{
    int coidCharacter;// Offset=0x8 Size=0x8
    int IDObjective;// Offset=0x10 Size=0x4
};

struct SMSG_Sector_ObjectiveState : public SMSG_Sector_Base// Size=0x28 (Id=17727)
{
    int coidCharacter;// Offset=0x8 Size=0x8
    int lChangeBitmask;// Offset=0x10 Size=0x4
    struct SVOGObjectiveState objectiveState;// Offset=0x14 Size=0x14
};