const pool = require('../db/pool');

// Resolve a cadeia unidade -> área -> regional a partir da unidade do
// usuário. Usada pra descobrir o escopo de um gestor_area/gestor_regional,
// já que "usuarios" só guarda unidade_id (ver SPEC.md).
async function resolverHierarquiaUnidade(unidadeId) {
  const { rows } = await pool.query(
    `SELECT un.id AS unidade_id, ar.id AS area_id, rg.id AS regional_id
     FROM unidades un
     JOIN areas ar ON ar.id = un.area_id
     JOIN regionais rg ON rg.id = ar.regional_id
     WHERE un.id = $1`,
    [unidadeId]
  );
  return rows[0] || null;
}

// Monta a condição SQL (e empilha o parâmetro em `params`) que restringe
// `alias` (uma coluna/subselect de unidade_id) ao que o papel do usuário
// autenticado pode ver. Não cobre 'colaborador', cujo escopo é por
// atribuição (causa/ação), tratado em cada controller.
async function condicaoUnidade(usuario, alias, params) {
  if (usuario.papel === 'admin') {
    return '1=1';
  }

  if (!usuario.unidade_id) {
    return '1=0';
  }

  if (usuario.papel === 'gestor_unidade') {
    params.push(usuario.unidade_id);
    return `${alias} = $${params.length}`;
  }

  const hierarquia = await resolverHierarquiaUnidade(usuario.unidade_id);
  if (!hierarquia) {
    return '1=0';
  }

  if (usuario.papel === 'gestor_area') {
    params.push(hierarquia.area_id);
    return `${alias} IN (SELECT id FROM unidades WHERE area_id = $${params.length})`;
  }

  if (usuario.papel === 'gestor_regional') {
    params.push(hierarquia.regional_id);
    return `${alias} IN (
      SELECT un.id FROM unidades un
      JOIN areas ar ON ar.id = un.area_id
      WHERE ar.regional_id = $${params.length}
    )`;
  }

  // colaborador ou papel desconhecido: sem escopo por unidade
  return '1=0';
}

module.exports = { resolverHierarquiaUnidade, condicaoUnidade };
