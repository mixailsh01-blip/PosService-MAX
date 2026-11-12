// Задания тренажёра. Тексты собираются из персональных данных сотрудника (SIM.env), поэтому у каждого свои.
// Правятся здесь; на сервере подхватываются командой sprt-update.
window.buildTasks = function () {
  var E = SIM.env;
  var org = "<b>«" + E.org.name + "»</b>", tg = "<b>«" + E.tg.name + "»</b>";
  var names = E.need.map(function (n) { return n.product.name; });
  var items = E.need.map(function (n) { return "«" + n.product.name + "» × " + n.amount; }).join(", ");
  var extraRow = E.extraKind === "comment" ? ["Комментарий к заказу (order.comment)", E.extraValue] : ["Имя клиента (order.customer.name)", E.extraValue];

  return [
    {
      id: "l1",
      title: "Получить токен",
      text: "Любая работа с iiko Cloud API начинается с токена. Отправьте <b>POST</b>-запрос на <code>/api/v2/access_token</code>: в теле JSON с вашим ключом и секретом. В ответе придёт <code>token</code>: он понадобится во всех следующих заданиях. Ваши персональные данные для входа:",
      data: [["apiKey", E.apiKey], ["clientSecret", E.clientSecret]]
    },
    {
      id: "l2",
      title: "Список организаций",
      text: "Запросите организации: <b>POST</b> <code>/api/1/organizations</code>. Токен передаётся заголовком <code>Authorization</code> со словом <code>Bearer</code> и токеном. В списке несколько организаций. Найдите " + org + " и запомните её <code>id</code>."
    },
    {
      id: "l3",
      title: "Терминальные группы",
      text: "Найдите кассу ресторана: <b>POST</b> <code>/api/1/terminal_groups</code>. В теле передайте массив <code>organizationIds</code> с id организации " + org + ". У организации несколько касс: найдите id кассы " + tg + "."
    },
    {
      id: "l4",
      title: "Меню (номенклатура)",
      text: "Получите меню организации " + org + ": <b>POST</b> <code>/api/1/nomenclature</code>, в теле поле <code>organizationId</code>. В <code>products</code> найдите <code>id</code> товаров: " + names.map(function (n) { return "«" + n + "»"; }).join(" и ") + ". Они понадобятся для заказа."
    },
    {
      id: "l5",
      title: "Создать заказ доставки",
      text: "Создайте заказ: <b>POST</b> <code>/api/1/deliveries/create</code>. В теле: <code>organizationId</code>, <code>terminalGroupId</code> (касса " + tg + ") и объект <code>order</code> с телефоном, позициями и полем из таблицы. Позиция: <code>type</code> = <code>Product</code>, <code>productId</code>, <code>amount</code>. Создание асинхронное: в ответе придёт <code>correlationId</code>, сохраните его.",
      data: [["Телефон (order.phone)", E.phone], ["Позиции (order.items)", items], extraRow]
    },
    {
      id: "l6",
      title: "Проверить статус заказа",
      text: "Заказ создаётся не мгновенно. Спросите статус команды: <b>POST</b> <code>/api/1/commands/status</code> с <code>organizationId</code> и <code>correlationId</code> из задания 5. Пока команда выполняется, придёт <code>InProgress</code>: подождите пару секунд и повторяйте запрос до <code>Success</code>."
    }
  ];
};
