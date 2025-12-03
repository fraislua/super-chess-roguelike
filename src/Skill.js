class Skill {
    // 【修正】allowedTypes = [] をデフォルト引数に追加
    constructor(id, name, description, type, tier, allowedTypes = []) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.type = type; // 'movement', 'passive', 'action'
        this.tier = tier;
        this.allowedTypes = allowedTypes; // ['pawn'] など
    }

    // 【修正】引数に game を追加
    onAcquire(piece, game) { }
    onTurnStart(piece, game) { }
    onMove(piece, move, game) { }
    onCaptureXp(piece, baseXp) { return baseXp; }
}

// ==========================================
//  Tier 1: Common Skills (基礎強化)
// ==========================================

class FastLearnerSkill extends Skill {
    constructor() {
        super('fast_learner', '学習家', 'ターン開始時、XP獲得 (+3% +5)', 'passive', 1);
    }

    onTurnStart(piece, game) {
        const gain = Math.floor(piece.xp * 0.03) + 5;
        piece.addXp(gain);
        game.emit('log', `${piece.getName()} が学習家で XP獲得 (+${gain})`, 'skill', piece.color);
        game.checkAndProcessLevelUp(piece, () => { });
    }
}

class SurvivalInstinctSkill extends Skill {
    constructor() {
        super('survival_instinct', '生存本能', '敵陣にいる時、XP獲得 (+6% +10)', 'passive', 1);
    }

    onTurnStart(piece, game) {
        let pRow = -1;
        // 自身の座標検索
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (game.board.getPiece(r, c) === piece) {
                    pRow = r;
                    break;
                }
            }
        }
        if (pRow === -1) return;

        const isEnemyTerritory = (piece.color === 'white' && pRow <= 3) ||
            (piece.color === 'black' && pRow >= 4);

        if (isEnemyTerritory) {
            const gain = Math.floor(piece.xp * 0.06) + 10;
            piece.addXp(gain);
            game.emit('log', `${piece.getName()} が生存本能で XP獲得 (+${gain})`, 'skill', piece.color);
            game.checkAndProcessLevelUp(piece, () => { });
        }
    }
}

class BountyHunterSkill extends Skill {
    constructor() {
        super('bounty_hunter', '賞金稼ぎ', '敵撃破時のXP +50%', 'passive', 1);
    }

    onCaptureXp(piece, baseXp) {
        return Math.floor(baseXp * 1.5);
    }
}

class SideStepSkill extends Skill {
    constructor() {
        super('side_step', '斜行歩兵', '斜め前1マスに移動できる', 'movement', 1, [PieceType.PAWN]);
    }
}

class SprinterSkill extends Skill {
    constructor() {
        super('sprinter', 'スプリンター', '常に2歩移動できる', 'movement', 1, [PieceType.PAWN]);
    }
}

// ==========================================
//  Tier 2: Uncommon Skills (戦術拡張)
// ==========================================

class CrossSwitchSkill extends Skill {
    constructor() {
        super('cross_switch', 'クロス・スイッチ', '周囲の味方と位置を入れ替える', 'action', 2);
    }
    // ロジックは Piece.getSkillMoves と Game.executeMove('swap') に実装
}

class TacticalBreakthroughSkill extends Skill {
    constructor() {
        super('tactical_breakthrough', '戦術的突破', '取得時、即座にこのコマは追加ターンを得る(1回のみ)', 'passive', 2);
    }

    // 【重要】スキル取得時にGameに介入して「追加ターン」を予約する
    onAcquire(piece, game) {
        if (game) {
            game.requestExtraTurn(piece);
            game.emit('log', `${piece.getName()} が戦術的突破を発動！(Time Warp)`, 'skill', piece.color);
        }
    }
}

class ComboStanceSkill extends Skill {
    constructor() {
        super('combo_stance', '連撃', '敵撃破の次ターン、移動範囲拡大(Queen化)', 'passive', 2, [PieceType.PAWN, PieceType.ROOK, PieceType.KNIGHT, PieceType.BISHOP, PieceType.KING]);
    }
    // ロジックは Piece.getValidMoves 内で hasKilledLastTurn を見て分岐
}

class AcrobaticsSkill extends Skill {
    constructor() {
        super('acrobatics', '軽業', '移動時、駒を飛び越えることができる', 'movement', 2);
    }
    // ロジックは Piece.getSlidingMoves に実装
}

class WideJumpSkill extends Skill {
    constructor() {
        super('wide_jump', '広域跳躍', 'ナイトの移動に十字2マスを追加', 'movement', 2, [PieceType.KNIGHT]);
    }
    // ロジックは Piece.getKnightMoves に実装
}

// ==========================================
//  Tier 3: Rare Skills (強力な戦術)
// ==========================================

class PiercingSkill extends Skill {
    constructor() {
        super('piercing', '攻撃貫通', '攻撃ライン上の敵を2体まで貫通して撃破可能', 'action', 3);
    }
    // ロジックは Piece.getSlidingMoves に実装
}

class FieldPromotionSkill extends Skill {
    constructor() {
        super('field_promotion', '現地任官', 'その場でプロモーションを行うことができる', 'action', 3, [PieceType.PAWN]);
    }
    // ロジックは Piece.getValidMoves (Pawn) に実装
}

class KingsChargeSkill extends Skill {
    constructor() {
        super('kings_charge', '王の突撃', 'キングの移動・攻撃範囲が周囲2マスに拡大', 'movement', 3, [PieceType.KING]);
    }
    // ロジックは Piece.getValidMoves (King) に実装
}

class CQCSkill extends Skill {
    constructor() {
        super('cqc', '近接格闘', '周囲1マス（キングの動き）を追加', 'movement', 3, [PieceType.BISHOP, PieceType.ROOK]);
    }
    // ロジックは Piece.getValidMoves (Bishop/Rook) に実装
}

class PaladinsSwordSkill extends Skill {
    constructor() {
        super('paladins_sword', '聖騎士の剣', 'ナイトの移動範囲（L字）を追加', 'movement', 3, [PieceType.BISHOP]);
    }
    // ロジックは Piece.getValidMoves (Bishop) に実装
}

class AmazonSkill extends Skill {
    constructor() {
        super('amazon', 'アマゾン', 'ナイトの移動範囲（L字）を追加', 'movement', 3, [PieceType.QUEEN]);
    }
    // ロジックは Piece.getValidMoves (Queen) に実装
}

// ==========================================
//  Tier 4: Legendary Skills (戦局を覆す)
// ==========================================

class SacrificeSkill extends Skill {
    constructor() {
        super('sacrifice', 'サクリファイス', '自身が倒された時、攻撃した敵を道連れにする', 'passive', 4);
    }
    // ロジックは Game.completeMoveProcessing に実装
}

class TyrantsMarchSkill extends Skill {
    constructor() {
        super('tyrants_march', '強者の威圧', '移動ルート上の敵を全て撃破して進む', 'action', 4);
    }
    // ロジックは Piece.getSlidingMoves に実装
}

class DecoySkill extends Skill {
    constructor() {
        super('decoy', '影武者', '撃破された際、味方と入れ替わり一度だけ復活する', 'passive', 4, [PieceType.KING]);
    }
    // ロジックは Game.gameOver / completeMoveProcessing に実装
}

class SuccessionSkill extends Skill {
    constructor() {
        super('succession', '王位継承', 'キング撃破時、自身がキングとなり敗北を防ぐ', 'passive', 4, [PieceType.QUEEN]);
    }
    // ロジックは Game.gameOver / completeMoveProcessing に実装
}