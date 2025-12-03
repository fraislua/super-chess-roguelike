const PieceType = {
    PAWN: 'pawn',
    ROOK: 'rook',
    KNIGHT: 'knight',
    BISHOP: 'bishop',
    QUEEN: 'queen',
    KING: 'king'
};

const PieceColor = {
    WHITE: 'white',
    BLACK: 'black'
};

class Piece {
    constructor(type, color) {
        this.type = type;
        this.color = color;
        this.hasMoved = false;
        this.id = crypto.randomUUID(); // Unique ID for tracking stats
        this.isRoyal = false;

        // RPG Stats
        this.level = 1;
        this.xp = 0;
        this.skills = [];

        // Tier 2: Combo Stance logic
        this.hasKilledLastTurn = false;
    }

    addXp(amount) {
        this.xp += amount;
    }

    getSymbol() {
        return '?';
    }

    getName() {
        return '不明なコマ';
    }

    hasSkill(skillId) {
        return this.skills.some(s => s.id === skillId);
    }

    // ---------------------------------------------------------
    //  Movement Helpers (Tier 1 & 2 Logic Implemented)
    // ---------------------------------------------------------

    // 共通: スキルによる特殊アクション（主に移動・入れ替え系）
    getSkillMoves(board, row, col) {
        const moves = [];

        // 【Tier 2】Cross Switch (クロス・スイッチ): 旧ロジック削除 -> 各移動メソッド内で処理
        // ここでは空にしておく（将来的に他の共通スキルが入る可能性あり）

        return moves;
    }

    // 共通: 連撃 (Combo Stance) 用の動き（クイーン化）
    getComboMoves(board, row, col) {
        if (this.hasSkill('combo_stance') && this.hasKilledLastTurn) {
            // クイーンの動き（縦横斜め無限）を返す
            // ※元がクイーンの場合は意味がないが、他の駒が強力になる
            return this.getSlidingMoves(board, row, col,
                [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
            );
        }
        return [];
    }

    // ヘルパー: スライディング移動 (Rook, Bishop, Queen) + 【Tier 2】軽業 + 【Tier 3】貫通 + 【Tier 4】強者の威圧
    getSlidingMoves(board, row, col, directions) {
        const moves = [];
        // Skill Checks
        const hasAcrobatics = this.hasSkill('acrobatics');
        const hasPiercing = this.hasSkill('piercing');
        const hasTyrantsMarch = this.hasSkill('tyrants_march');
        const hasCrossSwitch = this.hasSkill('cross_switch');

        directions.forEach(dir => {
            let r = row + dir[0];
            let c = col + dir[1];

            // For Tyrant's March: keep track of enemies in path
            let enemiesInPath = [];

            while (board.isValidPosition(r, c)) {
                const target = board.getPiece(r, c);

                if (!target) {
                    // Empty square
                    if (hasTyrantsMarch && enemiesInPath.length > 0) {
                        // Tyrant's March: Can move to empty square after crushing enemies
                        moves.push({ row: r, col: c, type: 'tyrant_move', crushed: [...enemiesInPath] });
                    } else {
                        // Normal move
                        moves.push({ row: r, col: c, type: 'normal' });
                    }
                } else {
                    // Occupied square
                    if (target.color !== this.color) {
                        // Enemy
                        if (hasTyrantsMarch) {
                            // Tyrant's March: Record enemy and continue
                            enemiesInPath.push({ piece: target, row: r, col: c });
                            // Don't add capture move yet, must land on empty square
                        } else {
                            // Normal Capture
                            moves.push({ row: r, col: c, type: 'capture' });

                            // 【Tier 3】Piercing (貫通)
                            if (hasPiercing) {
                                let pr = r + dir[0];
                                let pc = c + dir[1];
                                if (board.isValidPosition(pr, pc)) {
                                    const pTarget = board.getPiece(pr, pc);
                                    // 貫通先が敵なら「2枚抜き」
                                    if (pTarget && pTarget.color !== this.color) {
                                        moves.push({ row: pr, col: pc, type: 'pierce_capture', secondTarget: { row: pr, col: pc } });
                                    }
                                }
                            }
                        }
                    }

                    // Collision handling
                    if (hasTyrantsMarch && target.color !== this.color) {
                        // Continue if enemy (Tyrant's March)
                    } else if (target.color === this.color && hasCrossSwitch) {
                        // 【Tier 2】Cross Switch: 味方と入れ替え（味方は1マス手前に押し出される）
                        const pushBackRow = r - dir[0];
                        const pushBackCol = c - dir[1];
                        // 自分がいた場所(start)ではなく、移動経路上の一つ手前
                        moves.push({
                            row: r, col: c,
                            type: 'cross_switch',
                            pushBack: { row: pushBackRow, col: pushBackCol }
                        });
                        break; // 貫通はしない
                    } else if (hasAcrobatics) {
                        // Continue (Acrobatics) - Jump over
                        r += dir[0];
                        c += dir[1];
                        continue;
                    } else {
                        break; // Stop
                    }
                }
                r += dir[0];
                c += dir[1];
            }
        });

        return moves;
    }

    // ヘルパー: ナイト移動 (Knight) + 【Tier 2】広域跳躍
    getKnightMoves(board, row, col, isSkill = false) {
        const moves = [];
        const offsets = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];

        // 【Tier 2】Wide Jump (広域跳躍)
        // ナイトかつスキル所持なら、十字方向2マスを追加
        if (this.type === PieceType.KNIGHT && this.hasSkill('wide_jump')) {
            offsets.push([-2, 0], [2, 0], [0, -2], [0, 2]);
        }

        offsets.forEach(offset => {
            const r = row + offset[0];
            const c = col + offset[1];
            if (board.isValidPosition(r, c)) {
                const target = board.getPiece(r, c);
                if (!target || target.color !== this.color) {
                    moves.push({ row: r, col: c, type: isSkill ? 'skill' : (target ? 'capture' : 'normal') });
                } else if (target && target.color === this.color && this.hasSkill('cross_switch')) {
                    // 【Tier 2】Cross Switch (Knight): 完全入れ替え
                    moves.push({
                        row: r, col: c,
                        type: 'cross_switch',
                        pushBack: { row: row, col: col } // 元の位置に移動（Swap）
                    });
                }
            }
        });
        return moves;
    }

    getValidMoves(board, row, col, lastMove) {
        return [];
    }
}

// ---------------------------------------------------------
//  Subclasses
// ---------------------------------------------------------

class Pawn extends Piece {
    constructor(color) {
        super(PieceType.PAWN, color);
    }
    getSymbol() { return this.color === PieceColor.WHITE ? '♙' : '♟'; }
    getName() { return 'ポーン'; }

    getValidMoves(board, row, col, lastMove) {
        let moves = [];
        const direction = this.color === PieceColor.WHITE ? -1 : 1;
        const startRow = this.color === PieceColor.WHITE ? 6 : 1;

        // 1. 前進 (Forward 1)
        if (board.isValidPosition(row + direction, col)) {
            const target = board.getPiece(row + direction, col);
            if (!target) {
                moves.push({ row: row + direction, col: col, type: 'normal' });
            } else if (target.color === this.color && this.hasSkill('cross_switch')) {
                // 前方の味方と入れ替え
                moves.push({
                    row: row + direction, col: col,
                    type: 'cross_switch',
                    pushBack: { row: row, col: col }
                });
            }
        }

        // 2. 2歩移動 (Forward 2)
        // 初期位置 OR 【Tier 1】Sprinter (スプリンター)
        const forward2Row = row + direction * 2;
        const hasSprinter = this.hasSkill('sprinter');

        if ((row === startRow || hasSprinter) && board.isValidPosition(forward2Row, col)) {
            const target2 = board.getPiece(forward2Row, col);
            const target1 = board.getPiece(row + direction, col); // 間のマス

            if (!target2 && !target1) {
                moves.push({
                    row: forward2Row,
                    col: col,
                    type: hasSprinter && row !== startRow ? 'skill' : 'normal'
                });
            } else if (target2 && target2.color === this.color && !target1 && this.hasSkill('cross_switch')) {
                // 2歩先の味方と入れ替え（味方は間に押し出される）
                moves.push({
                    row: forward2Row,
                    col: col,
                    type: 'cross_switch',
                    pushBack: { row: row + direction, col: col }
                });
            }
        }

        // 3. 攻撃 (Captures) & 【Tier 1】Side Step
        [[direction, -1], [direction, 1]].forEach(offset => {
            const targetRow = row + offset[0];
            const targetCol = col + offset[1];
            if (board.isValidPosition(targetRow, targetCol)) {
                const targetPiece = board.getPiece(targetRow, targetCol);

                // 通常攻撃
                if (targetPiece && targetPiece.color !== this.color) {
                    moves.push({ row: targetRow, col: targetCol, type: 'capture' });
                }
                // 【Tier 1】Side Step (斜行歩兵): 敵がいなくても移動可能
                else if (!targetPiece && this.hasSkill('side_step')) {
                    moves.push({ row: targetRow, col: targetCol, type: 'skill' });
                }
                // 【Tier 2】Cross Switch (斜め): 味方と入れ替え
                else if (targetPiece && targetPiece.color === this.color && this.hasSkill('cross_switch')) {
                    moves.push({
                        row: targetRow, col: targetCol,
                        type: 'cross_switch',
                        pushBack: { row: row, col: col }
                    });
                }
            }
        });

        // 4. アンパッサン (En Passant)
        if (lastMove && lastMove.piece.type === PieceType.PAWN && Math.abs(lastMove.from.row - lastMove.to.row) === 2) {
            if (lastMove.to.row === row && Math.abs(lastMove.to.col - col) === 1) {
                moves.push({ row: row + direction, col: lastMove.to.col, type: 'en_passant' });
            }
        }

        // 【Tier 3】Field Promotion (現地任官)
        if (this.hasSkill('field_promotion')) {
            moves.push({ row: row, col: col, type: 'promotion_skill' });
        }

        // 【Tier 2】Combo Stance (連撃): クイーンの動きを追加
        moves.push(...this.getComboMoves(board, row, col));

        // 共通スキル (Cross Switchなど)
        moves.push(...this.getSkillMoves(board, row, col));

        return moves;
    }
}

class Rook extends Piece {
    constructor(color) {
        super(PieceType.ROOK, color);
    }
    getSymbol() { return this.color === PieceColor.WHITE ? '♖' : '♜'; }
    getName() { return 'ルーク'; }

    getValidMoves(board, row, col, lastMove) {
        const moves = this.getSlidingMoves(board, row, col, [[1, 0], [-1, 0], [0, 1], [0, -1]]);

        // 【Tier 3】CQC (近接格闘): キングの動きを追加
        if (this.hasSkill('cqc')) {
            const kOffsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
            kOffsets.forEach(offset => {
                const r = row + offset[0];
                const c = col + offset[1];
                if (board.isValidPosition(r, c)) {
                    const target = board.getPiece(r, c);
                    if (!target || target.color !== this.color) {
                        moves.push({ row: r, col: c, type: target ? 'capture' : 'normal' });
                    }
                }
            });
        }

        // 【Tier 2】Combo Stance
        moves.push(...this.getComboMoves(board, row, col));

        // 共通スキル
        moves.push(...this.getSkillMoves(board, row, col));
        return moves;
    }
}

class Knight extends Piece {
    constructor(color) {
        super(PieceType.KNIGHT, color);
    }
    getSymbol() { return this.color === PieceColor.WHITE ? '♘' : '♞'; }
    getName() { return 'ナイト'; }

    getValidMoves(board, row, col, lastMove) {
        // Wide Jump は getKnightMoves 内で処理済み
        const moves = this.getKnightMoves(board, row, col);

        // 【Tier 2】Combo Stance
        moves.push(...this.getComboMoves(board, row, col));

        // 共通スキル
        moves.push(...this.getSkillMoves(board, row, col));
        return moves;
    }
}

class Bishop extends Piece {
    constructor(color) {
        super(PieceType.BISHOP, color);
    }
    getSymbol() { return this.color === PieceColor.WHITE ? '♗' : '♝'; }
    getName() { return 'ビショップ'; }

    getValidMoves(board, row, col, lastMove) {
        const moves = this.getSlidingMoves(board, row, col, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);

        // 【Tier 3】CQC (近接格闘): キングの動きを追加
        if (this.hasSkill('cqc')) {
            const kOffsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
            kOffsets.forEach(offset => {
                const r = row + offset[0];
                const c = col + offset[1];
                if (board.isValidPosition(r, c)) {
                    const target = board.getPiece(r, c);
                    if (!target || target.color !== this.color) {
                        moves.push({ row: r, col: c, type: target ? 'capture' : 'normal' });
                    }
                }
            });
        }

        // 【Tier 3】Paladin's Sword (聖騎士の剣): ナイトの動きを追加
        if (this.hasSkill('paladins_sword')) {
            moves.push(...this.getKnightMoves(board, row, col, true));
        }

        // 【Tier 2】Combo Stance
        moves.push(...this.getComboMoves(board, row, col));

        // 共通スキル
        moves.push(...this.getSkillMoves(board, row, col));
        return moves;
    }
}

class Queen extends Piece {
    constructor(color) {
        super(PieceType.QUEEN, color);
    }
    getSymbol() { return this.color === PieceColor.WHITE ? '♕' : '♛'; }
    getName() { return 'クイーン'; }

    getValidMoves(board, row, col, lastMove) {
        const moves = this.getSlidingMoves(board, row, col, [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);

        // 【Tier 3】Amazon (アマゾン): ナイトの動きを追加
        if (this.hasSkill('amazon')) {
            moves.push(...this.getKnightMoves(board, row, col, true));
        }

        // 【Tier 2】Combo Stance
        // 元々クイーンなので動きは増えないが、仕様統一のため呼び出す（重複はUIやロジックで許容）
        // ※「再移動」などの独自実装をする場合はここに記述
        moves.push(...this.getComboMoves(board, row, col));

        // 共通スキル
        moves.push(...this.getSkillMoves(board, row, col));
        return moves;
    }
}

class King extends Piece {
    constructor(color) {
        super(PieceType.KING, color);
        this.isRoyal = true;
    }
    getSymbol() { return this.color === PieceColor.WHITE ? '♔' : '♚'; }
    getName() { return 'キング'; }

    getValidMoves(board, row, col, lastMove) {
        const moves = [];
        const offsets = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
        offsets.forEach(offset => {
            const r = row + offset[0];
            const c = col + offset[1];
            if (board.isValidPosition(r, c)) {
                const target = board.getPiece(r, c);
                if (!target || target.color !== this.color) {
                    moves.push({ row: r, col: c, type: target ? 'capture' : 'normal' });
                } else if (target && target.color === this.color && this.hasSkill('cross_switch')) {
                    // King Cross Switch (1マス移動) -> Swap
                    moves.push({
                        row: r, col: c,
                        type: 'cross_switch',
                        pushBack: { row: row, col: col }
                    });
                }
            }
        });

        // 【Tier 3】King's Charge (王の突撃): 周囲2マスに移動・攻撃範囲拡大
        if (this.hasSkill('kings_charge')) {
            const chargeOffsets = [
                [-2, -2], [-2, -1], [-2, 0], [-2, 1], [-2, 2],
                [-1, -2], [-1, 2],
                [0, -2], [0, 2],
                [1, -2], [1, 2],
                [2, -2], [2, -1], [2, 0], [2, 1], [2, 2]
            ];
            chargeOffsets.forEach(offset => {
                const r = row + offset[0];
                const c = col + offset[1];
                if (board.isValidPosition(r, c)) {
                    const target = board.getPiece(r, c);
                    if (!target || target.color !== this.color) {
                        moves.push({ row: r, col: c, type: target ? 'capture' : 'normal' });
                    } else if (target && target.color === this.color && this.hasSkill('cross_switch')) {
                        // King's Charge Cross Switch
                        let pbRow = row;
                        let pbCol = col;

                        // 2マス移動（直線・斜め）の場合は間のマスに押し出す
                        // ナイト移動（[-2, -1]など）の場合は入れ替え（Start位置へ）
                        if (Math.abs(offset[0]) % 2 === 0 && Math.abs(offset[1]) % 2 === 0) {
                            pbRow = row + offset[0] / 2;
                            pbCol = col + offset[1] / 2;
                        }

                        moves.push({
                            row: r, col: c,
                            type: 'cross_switch',
                            pushBack: { row: pbRow, col: pbCol }
                        });
                    }
                }
            });
        }

        // Castling
        if (!this.hasMoved) {
            // Kingside
            const rookK = board.getPiece(row, 7);
            if (rookK && rookK.type === PieceType.ROOK && !rookK.hasMoved) {
                if (!board.getPiece(row, 5) && !board.getPiece(row, 6)) {
                    moves.push({ row: row, col: 6, type: 'castling_king' });
                }
            }
            // Queenside
            const rookQ = board.getPiece(row, 0);
            if (rookQ && rookQ.type === PieceType.ROOK && !rookQ.hasMoved) {
                if (!board.getPiece(row, 1) && !board.getPiece(row, 2) && !board.getPiece(row, 3)) {
                    moves.push({ row: row, col: 2, type: 'castling_queen' });
                }
            }
        }

        // 【Tier 2】Combo Stance (キングも連撃でクイーン化可能)
        moves.push(...this.getComboMoves(board, row, col));

        // 共通スキル
        moves.push(...this.getSkillMoves(board, row, col));

        return moves;
    }
}