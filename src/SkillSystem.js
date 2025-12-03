class SkillSystem {
    constructor() {
        // ティアごとにスキルクラスを分類して保持
        this.skillsByTier = {
            1: [], // コモン
            2: [], // アンコモン
            3: [], // レア
            4: []  // レジェンダリー
        };

        // 確率テーブル (Lv -> [Tier1, Tier2, Tier3, Tier4] の確率%)
        this.probabilityTable = {
            2: [70, 25, 5, 0],
            3: [40, 45, 14, 1],
            4: [15, 35, 40, 10],
            5: [0, 20, 50, 30]
        };

        // スキルの登録（後で個別のスキル実装時にここを埋めていきます）
        this.registerSkills();

        // XP Table (Cumulative)
        this.xpTable = [0, 50, 200, 450, 800]; // Level 1, 2, 3, 4, 5
    }

    registerSkills() {
        // Tier 1 (Common)
        this.skillsByTier[1] = [
            FastLearnerSkill,
            SurvivalInstinctSkill,
            BountyHunterSkill,
            SideStepSkill,
            SprinterSkill
        ];

        // Tier 2 (Uncommon)
        this.skillsByTier[2] = [
            CrossSwitchSkill,
            TacticalBreakthroughSkill,
            ComboStanceSkill,
            AcrobaticsSkill,
            WideJumpSkill
        ];

        // Tier 3 (Rare)
        this.skillsByTier[3] = [
            PiercingSkill,
            FieldPromotionSkill,
            KingsChargeSkill,
            CQCSkill,
            PaladinsSwordSkill,
            AmazonSkill
        ];

        // Tier 4 (Legendary)
        this.skillsByTier[4] = [
            SacrificeSkill,
            TyrantsMarchSkill,
            DecoySkill,
            SuccessionSkill
        ];
    }

    // 指定されたレベルに基づいて、抽選するティアを決定する
    getTierForLevel(level) {
        const probs = this.probabilityTable[level];
        if (!probs) return 1; // 定義外ならTier1

        const rand = Math.random() * 100;
        let cumulative = 0;

        for (let i = 0; i < 4; i++) {
            cumulative += probs[i];
            if (rand < cumulative) {
                return i + 1; // Tierは1始まりなので +1
            }
        }
        return 1; // フォールバック
    }

    // 3つのスキル候補を選出するメインメソッド
    getRandomSkills(piece, count = 3) {
        const selectedSkills = [];

        // 3つの枠それぞれについて抽選を行う
        for (let i = 0; i < count; i++) {
            let targetTier = this.getTierForLevel(piece.level);
            let skillClass = this.pickSkillFromTier(targetTier, piece, selectedSkills);

            if (skillClass) {
                selectedSkills.push(new skillClass());
            }
        }

        return selectedSkills;
    }

    // 特定のティアからスキルを1つ選ぶ（枯渇時の救済ロジック含む）
    pickSkillFromTier(tier, piece, currentSelection) {
        // 再帰的な探索の上限（無限ループ防止）
        if (tier > 4) return null;

        // 1. そのティアの全スキルを取得
        const candidates = this.skillsByTier[tier];

        // 2. フィルタリング
        // - すでに駒が持っているスキルは除外
        // - 今回の抽選ですでに選ばれたスキル(currentSelection)も除外（重複防止）
        const available = candidates.filter(SkillClass => {
            const tempInstance = new SkillClass(); // ID確認用
            // 1. 既得チェック
            const hasSkill = piece.skills.some(s => s.id === tempInstance.id);
            // 2. 今回の抽選内での重複チェック
            const alreadyPicked = currentSelection.some(s => s.id === tempInstance.id);
            // 3. 【新規追加】タイプ適合チェック
            // allowedTypesが空なら全員OK。指定がある場合は、自分のtypeが含まれているか確認。
            const isTypeCompatible = tempInstance.allowedTypes.length === 0 || tempInstance.allowedTypes.includes(piece.type);
            // 4. すべての条件を満たすかチェック
            return !hasSkill && !alreadyPicked && isTypeCompatible;
        });

        // 3. 候補があればランダムに1つ返す
        if (available.length > 0) {
            const randIdx = Math.floor(Math.random() * available.length);
            return available[randIdx];
        }

        // 4. 候補がない場合（枯渇）、一つ上のティアから選択を試みる（仕様）
        return this.pickSkillFromTier(tier + 1, piece, currentSelection);
    }

    getLevelThreshold(level) {
        if (level >= 5) return this.xpTable[4];
        return this.xpTable[level] || 9999;
    }

    getLevelProgress(piece) {
        if (piece.level >= 5) return { current: 100, max: 100, percent: 100 };

        const currentLevelXp = this.xpTable[piece.level - 1];
        const nextLevelXp = this.xpTable[piece.level];
        const xpInLevel = piece.xp - currentLevelXp;
        const requiredForNext = nextLevelXp - currentLevelXp;

        let percent = (xpInLevel / requiredForNext) * 100;
        percent = Math.max(0, Math.min(100, percent));

        return {
            current: xpInLevel,
            max: requiredForNext,
            percent: percent
        };
    }

    checkLevelUp(piece) {
        if (piece.level >= 5) return false;
        const threshold = this.getLevelThreshold(piece.level);
        if (piece.xp >= threshold) {
            piece.level++;
            return true;
        }
        return false;
    }

    applySkill(piece, skill, game) {
        piece.skills.push(skill);
        skill.onAcquire(piece, game);
    }
}

window.skillSystem = new SkillSystem();
