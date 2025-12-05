class Board {
    constructor() {
        this.rows = 8;
        this.cols = 8;
        this.grid = [];
        this.init();
    }

    init() {
        this.grid = Array(this.rows).fill(null).map(() => Array(this.cols).fill(null));
        this.setupPieces();
    }

    setupPieces() {
        this.setupRow(0, PieceColor.BLACK, [Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook]);
        this.setupPawns(1, PieceColor.BLACK);
        this.setupPawns(6, PieceColor.WHITE);
        this.setupRow(7, PieceColor.WHITE, [Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook]);
    }

    setupRow(row, color, pieceClasses) {
        pieceClasses.forEach((PieceClass, col) => {
            const piece = new PieceClass(color);
            piece.row = row;
            piece.col = col;
            this.grid[row][col] = piece;
        });
    }

    setupPawns(row, color) {
        for (let col = 0; col < this.cols; col++) {
            const piece = new Pawn(color);
            piece.row = row;
            piece.col = col;
            this.grid[row][col] = piece;
        }
    }

    getPiece(row, col) {
        if (this.isValidPosition(row, col)) return this.grid[row][col];
        return null;
    }

    setPiece(row, col, piece) {
        if (this.isValidPosition(row, col)) {
            this.grid[row][col] = piece;
            if (piece) {
                piece.row = row;
                piece.col = col;
            }
        }
    }

    movePiece(fromRow, fromCol, toRow, toCol) {
        const piece = this.getPiece(fromRow, fromCol);
        const target = this.getPiece(toRow, toCol);
        if (piece) {
            // Self-move check (for Field Promotion validation)
            if (fromRow === toRow && fromCol === toCol) {
                return target; // Do nothing, just return target (which is self)
            }

            this.grid[toRow][toCol] = piece;
            this.grid[fromRow][fromCol] = null;
            piece.hasMoved = true;
            piece.row = toRow;
            piece.col = toCol;
            return target;
        }
        return null;
    }

    isValidPosition(row, col) {
        return row >= 0 && row < 8 && col >= 0 && col < 8;
    }

    clone() {
        const newBoard = new Board();
        // Deep copy the grid
        newBoard.grid = this.grid.map(row => row.map(piece => {
            if (!piece) return null;
            // Create a new piece instance with same properties
            // Note: We need to ensure we use the correct class constructor
            // For now, we can use Object.assign or similar, but ideally we want the prototype chain.
            // Since we don't have easy access to classes here without importing, 
            // we'll rely on the fact that we can just copy the object structure for simulation purposes
            // OR better: we can use the constructor property if available.
            const newPiece = new piece.constructor(piece.color);
            Object.assign(newPiece, piece);
            newPiece.skills = [...piece.skills]; // Deep copy skills array
            return newPiece;
        }));
        return newBoard;
    }
}
