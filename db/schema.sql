-- ============================================================
-- SCHEMA: Sistema FCA (Fato -> Causa -> Ação) com Prazos e Planos
-- Hierarquia organizacional: Regional -> Área -> Unidade
-- PostgreSQL 14+
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- habilita gen_random_uuid()

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------

CREATE TYPE papel_usuario AS ENUM (
    'admin',            -- acesso total
    'gestor_regional',  -- vê todas as áreas/unidades da regional
    'gestor_area',      -- vê todas as unidades da sua área
    'gestor_unidade',   -- vê apenas a própria unidade
    'colaborador'       -- só vê o que lhe foi atribuído
);

CREATE TYPE status_fato AS ENUM (
    'aberto',
    'em_andamento',
    'concluido',
    'cancelado'
);

-- status_acao é 100% calculado a partir das datas (ver
-- fn_calcular_status_acao) — nunca é definido manualmente:
--   sem data_iniciada e sem data_finalizada  -> nao_iniciada
--   com data_iniciada, sem data_finalizada   -> em_andamento
--   data_finalizada = final_previsto         -> concluida
--   data_finalizada < final_previsto         -> adiantada
--   data_finalizada > final_previsto         -> atrasada
CREATE TYPE status_acao AS ENUM (
    'nao_iniciada',
    'em_andamento',
    'concluida',
    'adiantada',
    'atrasada'
);

-- ------------------------------------------------------------
-- TABELA: regionais
-- ------------------------------------------------------------

CREATE TABLE regionais (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome        VARCHAR(100) NOT NULL UNIQUE, -- ex: "Regional Norte"
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- TABELA: areas (dentro de uma regional)
-- Ex: Captação, Operações, Pedagógico...
-- ------------------------------------------------------------

CREATE TABLE areas (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    regional_id  UUID NOT NULL REFERENCES regionais(id) ON DELETE CASCADE,
    nome         VARCHAR(150) NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (regional_id, nome)
);

CREATE INDEX idx_areas_regional ON areas(regional_id);

-- ------------------------------------------------------------
-- TABELA: unidades (campi, dentro de uma área)
-- ------------------------------------------------------------

CREATE TABLE unidades (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id     UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    nome        VARCHAR(150) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (area_id, nome)
);

CREATE INDEX idx_unidades_area ON unidades(area_id);

-- ------------------------------------------------------------
-- TABELA: usuarios
-- Um responsável (de causa ou ação) nem sempre já tem acesso ao
-- sistema: ao atribuir pelo e-mail, se não existir usuario com
-- aquele e-mail, a aplicação cria a linha aqui mesmo (papel
-- 'colaborador', senha_hash NULL) e dispara o convite. A pessoa
-- só define senha ao aceitar — a conta (e o vínculo com as ações
-- que já foram atribuídas a ela) já existe desde o convite.
-- ------------------------------------------------------------

CREATE TABLE usuarios (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome                VARCHAR(150), -- pode ficar nulo até o convidado completar o cadastro
    email               VARCHAR(150) NOT NULL UNIQUE,
    unidade_id          UUID REFERENCES unidades(id) ON DELETE SET NULL,
    papel               papel_usuario NOT NULL DEFAULT 'colaborador',
    ativo               BOOLEAN NOT NULL DEFAULT true,
    senha_hash          TEXT, -- NULL = convite ainda não aceito, sem acesso ao sistema
    convite_token       UUID, -- token do link de convite; limpo ao definir a senha
    convite_enviado_em  TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_usuarios_unidade ON usuarios(unidade_id);
CREATE UNIQUE INDEX idx_usuarios_convite_token ON usuarios(convite_token) WHERE convite_token IS NOT NULL;

-- ------------------------------------------------------------
-- TABELA: fatos
-- ------------------------------------------------------------

CREATE TABLE fatos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unidade_id          UUID NOT NULL REFERENCES unidades(id),
    -- TEXT (não VARCHAR) porque guarda HTML sanitizado (cor + <br>) do
    -- editor de texto rico do título, não só texto puro — ver
    -- src/utils/richText.js
    titulo              TEXT NOT NULL,
    descricao           TEXT,
    data_identificacao  DATE NOT NULL DEFAULT CURRENT_DATE,
    status              status_fato NOT NULL DEFAULT 'aberto',
    criado_por          UUID REFERENCES usuarios(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_fatos_unidade ON fatos(unidade_id);
CREATE INDEX idx_fatos_status ON fatos(status);

-- ------------------------------------------------------------
-- TABELA: causas
-- ------------------------------------------------------------

CREATE TABLE causas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fato_id         UUID NOT NULL REFERENCES fatos(id) ON DELETE CASCADE,
    descricao       TEXT NOT NULL,
    responsavel_id  UUID REFERENCES usuarios(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_causas_fato ON causas(fato_id);

-- ------------------------------------------------------------
-- TABELA: acoes
-- inicio_previsto / final_previsto: obrigatórias na criação
-- data_iniciada / data_finalizada: preenchidas manualmente
--   conforme a ação acontece de verdade — e é a partir delas
--   que o status é calculado (nunca definido na mão)
-- dias_previsto: final_previsto - inicio_previsto
-- dias_reais: data_finalizada - inicio_previsto
-- ------------------------------------------------------------

CREATE TABLE acoes (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    causa_id         UUID NOT NULL REFERENCES causas(id) ON DELETE CASCADE,
    descricao        TEXT NOT NULL,
    inicio_previsto  DATE NOT NULL,
    final_previsto   DATE NOT NULL,
    data_iniciada    DATE,
    data_finalizada  DATE,
    status           status_acao NOT NULL DEFAULT 'nao_iniciada',
    evidencia        TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    dias_previsto    INTEGER GENERATED ALWAYS AS (final_previsto - inicio_previsto) STORED,
    dias_reais       INTEGER GENERATED ALWAYS AS (data_finalizada - inicio_previsto) STORED,
    CONSTRAINT chk_acoes_datas_previstas CHECK (final_previsto >= inicio_previsto),
    CONSTRAINT chk_acoes_datas_reais CHECK (
        data_finalizada IS NULL
        OR (data_iniciada IS NOT NULL AND data_finalizada >= data_iniciada)
    )
);

CREATE INDEX idx_acoes_causa ON acoes(causa_id);
CREATE INDEX idx_acoes_final_previsto ON acoes(final_previsto);
CREATE INDEX idx_acoes_status ON acoes(status);

-- ------------------------------------------------------------
-- TABELA: acoes_responsaveis
-- Uma ação pode ter mais de um responsável (ex: dois colaboradores
-- dividindo a execução) — por isso é relação muitos-para-muitos,
-- e não uma coluna única em "acoes". "causas.responsavel_id"
-- continua único: é o dono/quem identificou a causa, conceito
-- diferente de quem executa as ações.
-- ------------------------------------------------------------

CREATE TABLE acoes_responsaveis (
    acao_id     UUID NOT NULL REFERENCES acoes(id) ON DELETE CASCADE,
    usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    PRIMARY KEY (acao_id, usuario_id)
);

CREATE INDEX idx_acoes_responsaveis_usuario ON acoes_responsaveis(usuario_id);

-- ------------------------------------------------------------
-- TRIGGER genérica: atualiza updated_at
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fatos_updated_at
    BEFORE UPDATE ON fatos
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_acoes_updated_at
    BEFORE UPDATE ON acoes
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ------------------------------------------------------------
-- TRIGGER: calcula status_acao a partir das datas reais.
-- Dispara também em tentativa de UPDATE direto de "status",
-- então qualquer valor manual é sempre sobrescrito pelo
-- valor correto derivado das datas.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_calcular_status_acao() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.data_finalizada IS NOT NULL THEN
        IF NEW.data_finalizada = NEW.final_previsto THEN
            NEW.status := 'concluida';
        ELSIF NEW.data_finalizada < NEW.final_previsto THEN
            NEW.status := 'adiantada';
        ELSE
            NEW.status := 'atrasada';
        END IF;
    ELSIF NEW.data_iniciada IS NOT NULL THEN
        NEW.status := 'em_andamento';
    ELSE
        NEW.status := 'nao_iniciada';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calcular_status_acao
    BEFORE INSERT OR UPDATE OF data_iniciada, data_finalizada, status ON acoes
    FOR EACH ROW EXECUTE FUNCTION fn_calcular_status_acao();

-- ------------------------------------------------------------
-- TRIGGER: recalcula status_fato a partir do conjunto de ações
-- (de todas as causas do fato), sempre que data_iniciada ou
-- data_finalizada de uma ação mudam (que é o que de fato move
-- o status da ação agora). 'cancelado' é sempre manual e nunca
-- é sobrescrito aqui.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_atualizar_status_fato() RETURNS TRIGGER AS $$
DECLARE
    v_fato_id      UUID;
    v_total        INT;
    v_concluidas   INT;
    v_iniciadas    INT;
BEGIN
    SELECT c.fato_id INTO v_fato_id
    FROM causas c
    WHERE c.id = COALESCE(NEW.causa_id, OLD.causa_id);

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE a.status IN ('concluida', 'adiantada', 'atrasada')),
        COUNT(*) FILTER (WHERE a.status IN ('em_andamento', 'concluida', 'adiantada', 'atrasada'))
    INTO v_total, v_concluidas, v_iniciadas
    FROM acoes a
    JOIN causas c ON c.id = a.causa_id
    WHERE c.fato_id = v_fato_id;

    UPDATE fatos SET status = CASE
        WHEN status = 'cancelado' THEN status           -- nunca sobrescreve cancelamento manual
        WHEN v_total = 0 THEN 'aberto'::status_fato
        WHEN v_total = v_concluidas THEN 'concluido'::status_fato
        WHEN v_iniciadas > 0 THEN 'em_andamento'::status_fato
        ELSE 'aberto'::status_fato
    END
    WHERE id = v_fato_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_atualizar_status_fato
    AFTER INSERT OR UPDATE OF data_iniciada, data_finalizada OR DELETE ON acoes
    FOR EACH ROW EXECUTE FUNCTION fn_atualizar_status_fato();

-- ------------------------------------------------------------
-- VIEW: ações com hierarquia completa + alerta de prazo vencido
-- sem conclusão (usada no Painel de Prazos). "atrasada" já é
-- um status em si (concluída depois do prazo) — este flag aqui
-- é pra ações ainda nao_iniciada/em_andamento cujo prazo já
-- passou, que é um alerta diferente (ainda em aberto).
-- ------------------------------------------------------------

CREATE VIEW vw_acoes_detalhadas AS
SELECT
    a.id,
    a.causa_id,
    c.fato_id,
    un.id   AS unidade_id,
    un.nome AS unidade_nome,
    ar.id   AS area_id,
    ar.nome AS area_nome,
    rg.id   AS regional_id,
    rg.nome AS regional_nome,
    a.descricao,
    ARRAY_REMOVE(ARRAY_AGG(u.id ORDER BY u.nome), NULL) AS responsaveis_ids,
    STRING_AGG(u.nome, ', ' ORDER BY u.nome) AS responsaveis_nomes,
    a.inicio_previsto,
    a.final_previsto,
    a.data_iniciada,
    a.data_finalizada,
    a.dias_previsto,
    a.dias_reais,
    a.status,
    (a.status IN ('nao_iniciada', 'em_andamento') AND a.final_previsto < CURRENT_DATE) AS prazo_vencido_sem_conclusao,
    (a.final_previsto - CURRENT_DATE) AS dias_para_vencer
FROM acoes a
JOIN causas c ON c.id = a.causa_id
JOIN fatos f ON f.id = c.fato_id
JOIN unidades un ON un.id = f.unidade_id
JOIN areas ar ON ar.id = un.area_id
JOIN regionais rg ON rg.id = ar.regional_id
LEFT JOIN acoes_responsaveis res ON res.acao_id = a.id
LEFT JOIN usuarios u ON u.id = res.usuario_id
GROUP BY a.id, a.causa_id, c.fato_id, un.id, un.nome, ar.id, ar.nome, rg.id, rg.nome,
         a.descricao, a.inicio_previsto, a.final_previsto, a.data_iniciada, a.data_finalizada,
         a.dias_previsto, a.dias_reais, a.status;

-- ------------------------------------------------------------
-- VIEW: plano consolidado por fato + hierarquia completa
-- (usada na tela "Plano" e no dashboard por regional/área/unidade)
-- ------------------------------------------------------------

CREATE VIEW vw_plano_fato AS
SELECT
    f.id AS fato_id,
    f.titulo,
    un.id   AS unidade_id,
    un.nome AS unidade_nome,
    ar.id   AS area_id,
    ar.nome AS area_nome,
    rg.id   AS regional_id,
    rg.nome AS regional_nome,
    f.status AS status_fato,
    COUNT(a.id) AS total_acoes,
    COUNT(a.id) FILTER (WHERE a.status IN ('concluida', 'adiantada', 'atrasada')) AS acoes_concluidas,
    COUNT(a.id) FILTER (WHERE a.status = 'adiantada') AS acoes_adiantadas,
    COUNT(a.id) FILTER (WHERE a.status = 'atrasada') AS acoes_concluidas_com_atraso,
    COUNT(a.id) FILTER (WHERE a.status IN ('nao_iniciada', 'em_andamento') AND a.final_previsto < CURRENT_DATE) AS acoes_prazo_vencido_sem_conclusao,
    ROUND(
        100.0 * COUNT(a.id) FILTER (WHERE a.status IN ('concluida', 'adiantada', 'atrasada')) / NULLIF(COUNT(a.id), 0), 1
    ) AS percentual_conclusao
FROM fatos f
JOIN unidades un ON un.id = f.unidade_id
JOIN areas ar ON ar.id = un.area_id
JOIN regionais rg ON rg.id = ar.regional_id
LEFT JOIN causas c ON c.fato_id = f.id
LEFT JOIN acoes a ON a.causa_id = c.id
GROUP BY f.id, f.titulo, un.id, un.nome, ar.id, ar.nome, rg.id, rg.nome, f.status;
