var NO_AUTH = 0,
    SIMPLE_PASSWORD = 1,
    EXTERNAL_RADIUS = 2,
    HOTSPOT = 11,
    EXTERNAL_LDAP = 15;

var VOUCHER_ACCESS_TYPE = 3,
    LOCAL_USER_ACCESS_TYPE = 5,
    SMS_ACCESS_TYPE = 6,
    RADIUS_ACCESS_TYPE = 8,
    FORM_AUTH_ACCESS_TYPE = 12;

var MAX_INPUT_LEN = 2000;

var Ajax = {
    post: function (url, data, fn) {
        var xhr = new XMLHttpRequest();
        xhr.open("POST", url, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.onreadystatechange = function() {
            if (xhr.readyState == 4 && (xhr.status == 200 || xhr.status == 304)) {
                fn.call(this, xhr.responseText);
            }
        };
        xhr.send(data);
    }
};
var data = {};
var globalConfig = {};
var submitUrl;
var clientMac = getQueryStringKey("clientMac");
var apMac = getQueryStringKey("apMac");
var gatewayMac = getQueryStringKey("gatewayMac") || undefined;
var ssidName = getQueryStringKey("ssidName") || undefined;
var radioId = !!getQueryStringKey("radioId")? Number(getQueryStringKey("radioId")) : undefined;
var vid = !!getQueryStringKey("vid")? Number(getQueryStringKey("vid")) : undefined;
var originUrl = getQueryStringKey("originUrl");
var previewSite = getQueryStringKey("previewSite");

var hotspotMap = {
    3: "Voucher Access",
    5: "Local User Access",
    6: "SMS Access",
    8: "RADIUS Access",
    12: "Form Auth Access"
};

var errorHintMap = {
    "0": "ok",
    "-1": "General error.",
    "-41500": "Invalid authentication type.",
    "-41501": "Failed to authenticate.",
    "-41502": "Voucher code is incorrect.",
    "-41503": "Voucher is expired.",
    "-41504": "Voucher traffic has exceeded the limit.",
    "-41505": "The number of users has reached the limit.",
    "-41506": "Invalid authorization information.",
    "-41507": "Your authentication times out. You can get authenticated again until the next day.",
    "-41508": "Local User traffic has exceeded the limit.",
    "-41512": "Local User is expired.",
    "-41513": "Local User is disabled.",
    "-41514": "MAC address is incorrect.",
    "-41515": "Local User Quota has exceeded the limit.",
    "-41516": "The number of users has reached the limit.",
    "-41517": "Incorrect password.",
    "-41518": "This SSID does not exist.",
    "-41519": "Invalid code.",
    "-41520": "The code is expired.",
    "-41521": "The number of users has reached the limit.",
    "-41522": "Failed to validate the code.",
    "-41523": "Failed to send verification code.",
    "-41524": "Authentication failed because the username does not exist.",
    "-41525": "Authentication failed because of wrong password.",
    "-41526": "Authentication failed because the client is invalid.",
    "-41527": "Authentication failed because the local user is invalid.",
    "-41528": "Failed to decrypt data.",
    "-41529": "Incorrect username or password.",
    "-41530": "Connecting to the RADIUS server times out.",
    "-41531": "Your code have reached your Wi-Fi data limit.",
    "-41532": "Your account have reached your Wi-Fi data limit.",
    "-41533": "Form authentication request is invalid.",
    "-43408": "Invalid LDAP configuration.",
    "-43409": "Invalid LDAP credentials.",
    "-41538": "Voucher is not effective."
};

var isCommited;
var formAuthController = useFormAuthController()

function getQueryStringKey (key) {
    return getQueryStringAsObject()[key];
}
function getQueryStringAsObject () {
    var b, cv, e, k, ma, sk, v, r = {},
        d = function (v) { return decodeURIComponent(v); }, //# d(ecode) the v(alue)
        q = window.location.search.substring(1), //# suggested: q = decodeURIComponent(window.location.search.substring(1)),
        s = /([^&;=]+)=?([^&;]*)/g //# original regex that does not allow for ; as a delimiter:   /([^&=]+)=?([^&]*)/g
    ;
    ma = function(v) {
        if (typeof v != "object") {
            cv = v;
            v = {};
            v.length = 0;
            if (cv) { Array.prototype.push.call(v, cv); }
        }
        return v;
    };
    while (e = s.exec(q)) {
        b = e[1].indexOf("[");
        v = d(e[2]);
        if (b < 0) {
            k = d(e[1]);
            if (r[k]) {
                r[k] = ma(r[k]);
                Array.prototype.push.call(r[k], v);
            }
            else {
                r[k] = v;
            }
        }
        else {
            k = d(e[1].slice(0, b));
            sk = d(e[1].slice(b + 1, e[1].indexOf("]", b)));
            r[k] = ma(r[k]);
            if (sk) { r[k][sk] = v; }
            else { Array.prototype.push.call(r[k], v); }
        }
    }
    return r;
}
Ajax.post(
    '/portal/getPortalPageSetting',
    JSON.stringify({
        "clientMac": clientMac,
        "apMac": apMac,
        "gatewayMac": gatewayMac,
        "ssidName": ssidName,
        "radioId": radioId,
        "vid": vid,
        "originUrl": originUrl
    }),
    function (res) {
        res = JSON.parse(res);
        data = res.result;
        submitUrl           = "/portal/auth";
        var landingUrl  = data.landingUrl;
        isCommited          = false;
        globalConfig = {
            authType: data.authType,
            hotspotTypes: !!data.hotspot && data.hotspot.enabledTypes || [],
            buttonText: data.portalCustomize.buttonText || 'Log In',
            formAuthButtonText: data.portalCustomize.formAuthButtonText || 'Take the Survey',
            formAuth: data.formAuth || {},
            error         : data.error || 'ok',
            countryCode   : !!data.sms && data.sms.countryCode || 1
        };
        function pageConfigParse(){
            if (res.errorCode !== 0){
                document.getElementById("oper-hint").style.display = "block";
                document.getElementById("oper-hint").innerHTML = errorHintMap[res.errorCode];
            }
            document.getElementById("hotspot-section").style.display = "none";
            document.getElementById("input-voucher").style.display = "none";
            document.getElementById("input-user").style.display = "none";
            document.getElementById("input-password").style.display = "none";
            document.getElementById("input-simple").style.display = "none";
            document.getElementById("input-phone-num").style.display = "none";
            document.getElementById("input-verify-code").style.display = "none";
            switch (globalConfig.authType){
                case NO_AUTH:
                    window.authType = 0;
                    break;
                case SIMPLE_PASSWORD:
                    document.getElementById("input-simple").style.display = "block";
                    window.authType = 1;
                    break;
                case EXTERNAL_RADIUS:
                    hotspotChang(2);
                    window.authType = 2;
                    break;
                case EXTERNAL_LDAP:
                    hotspotChang(15);
                    window.authType = 15;
                    break;
                case HOTSPOT:
                    document.getElementById("hotspot-section").style.display = "block";
                    var options = "";
                    for (var i=0;i<globalConfig.hotspotTypes.length;i++) {
                        options += '<option value="'+globalConfig.hotspotTypes[i]+'">'+hotspotMap[globalConfig.hotspotTypes[i]]+'</option>';
                    }
                    document.getElementById("hotspot-selector").innerHTML = options;
                    hotspotChang(globalConfig.hotspotTypes[0]);
                    window.authType = globalConfig.hotspotTypes[0];
                    break;
            }
        }

        function handleSubmit(){
            var submitData = {};
            submitData['authType'] = window.authType;
            switch (window.authType){
                case 3:
                    submitData['voucherCode'] = document.getElementById("voucherCode").value;
                    break;
                case 5:
                    submitData['localuser'] = document.getElementById("username").value;
                    submitData['localuserPsw'] = document.getElementById("password").value;
                    break;
                case 1:
                    submitData['simplePassword'] = document.getElementById("simplePassword").value;
                    break;
                case 0:
                    break;
                case 6:
                    submitData['phone'] = "+"+document.getElementById("country-code").value + document.getElementById("phone-number").value;
                    submitData['code'] = document.getElementById("verify-code").value;
                    break;
                case 2:
                case 8:
                    submitData['username'] = document.getElementById("username").value;
                    submitData['password'] = document.getElementById("password").value;
                    break;
                case 15:
                  submitData['ldapUsername'] = document.getElementById("username").value;
                  submitData['ldapPassword'] = document.getElementById("password").value;
                  break;
                case FORM_AUTH_ACCESS_TYPE:
                  $.extend(submitData, formAuthController.getAuthData());
                default:
                    break;
            }

            if(isCommited == false){
                submitData['clientMac'] = clientMac;
                submitData['apMac'] = apMac;
                submitData['gatewayMac'] = gatewayMac;
                submitData['ssidName'] = ssidName;
                submitData['radioId'] = radioId;
                submitData['vid'] = vid;
                if(window.authType == 2 || window.authType == 8 || window.authType === 15){
                    if(window.authType === 15) {
                      submitUrl = '/portal/ldap/auth';
                    } else {
                      submitUrl = "/portal/radius/auth";
                    }
                    submitData['authType'] = window.authType;
                } else {
                    submitData['originUrl'] = originUrl;
                }
                function doAuth () {
                    Ajax.post(submitUrl, JSON.stringify(submitData).toString(), function(data){
                        data = JSON.parse(data);
                        if(!!data && data.errorCode === 0) {
                            isCommited = true;
                            landingUrl = data.result || landingUrl
                            window.location.href = landingUrl;
                            document.getElementById("oper-hint").innerHTML = errorHintMap[data.errorCode];
                        } else{
                            document.getElementById("oper-hint").innerHTML = errorHintMap[data.errorCode];
                        }
                    });
                }
                doAuth();
            }
        }
        function hotspotChang (type) {

            document.getElementById("input-voucher").style.display = "none";
            document.getElementById("input-user").style.display = "none";
            document.getElementById("input-password").style.display = "none";
            document.getElementById("input-phone-num").style.display = "none";
            document.getElementById("input-verify-code").style.display = "none";
            document.getElementById("button-login").style.display = "block";
            window.authType = Number(type);
            switch (Number(type)) {
                case VOUCHER_ACCESS_TYPE:
                    document.getElementById("input-voucher").style.display = "block";
                    setNormalButton()
                    break;
                case LOCAL_USER_ACCESS_TYPE:
                case EXTERNAL_RADIUS:
                case RADIUS_ACCESS_TYPE:
                case EXTERNAL_LDAP:
                    document.getElementById("input-user").style.display = "block";
                    document.getElementById("input-password").style.display = "block";
                    setNormalButton()
                    break;
                case SMS_ACCESS_TYPE:
                    document.getElementById("input-phone-num").style.display = "block";
                    document.getElementById("input-verify-code").style.display = "block";
                    setNormalButton()
                    break;
                case FORM_AUTH_ACCESS_TYPE:
                    formAuthController.init(globalConfig)
                    break
            }
        }
        globalConfig.countryCode = "+" + parseInt(globalConfig.countryCode, 10);
        document.getElementById("country-code").value = parseInt(globalConfig.countryCode, 10);
        document.getElementById("hotspot-selector").addEventListener("change", function () {
            var obj = document.getElementById("hotspot-selector");
            var opt = obj.options[obj.selectedIndex];
            hotspotChang(opt.value);
        });
        document.getElementById("button-login").addEventListener("click", function () {
          if(window.authType === FORM_AUTH_ACCESS_TYPE) {
            formAuthController.showFormAuth(globalConfig);
          } else {
            handleSubmit();
          }
        });
        $("#form-auth-submit").on("click", function () {formAuthController.submitFormAuth(handleSubmit)});
        document.getElementById("get-code").addEventListener("click", function(e){
            e.preventDefault();
            var phoneNum = document.getElementById("phone-number").value;
            function sendSmsAuthCode () {
                Ajax.post("/portal/sendSmsAuthCode",
                    JSON.stringify({
                        clientMac: clientMac,
                        apMac: apMac,
                        gatewayMac: gatewayMac,
                        ssidName: ssidName,
                        radioId: radioId,
                        vid: vid,
                        phone: "+" + document.getElementById("country-code").value + phoneNum
                    }),function(data){
                        data = JSON.parse(data);
                        if(data.errorCode !== 0){
                            document.getElementById("oper-hint").innerHTML = errorHintMap[data.errorCode];
                        } else {
                            document.getElementById("oper-hint").innerHTML = "SMS has been sent successfully.";
                        }
                    }
                );
            }
            sendSmsAuthCode();
            document.getElementById("oper-hint").innerHTML = "Sending Authorization Code...";
        });
        pageConfigParse();
    }
);

function useFormAuthUtil () {
  function transferChoices(card) {
    var choices = [];
    $.each(card.choices, function (index, choice) {
      choices.push({
        value: index,
        text: choice
      });
    });
    if (card.others) {
      choices.push({
        value: choices.length,
        text: card.others
      });
    }
    return choices;
  }

  function getOthersHtml() {
    return '<div class="others-outer hidden"><input class="input" maxlength="'+MAX_INPUT_LEN+'" type="text" /></div>';
  }

  function getValidateHtml () {
    return '<div class="validate-outer hidden">This field cannot start with special characters + - @ =</div>'
  }

  function getRequiredHtml(text) {
    if (text) {
      return '<div class="required-outer hidden">' + text + '</div>';
    }
    return '';
  }

  function getCardContainer(cardIndex) {
    return $('#form-auth-content .card-container[card-index="' + cardIndex + '"]');
  }

  function getCardHtml(card, cardIndex, contentHtml) {
    return ('<div class="card-container"  card-index="' + cardIndex + '">' +
      '<div class="card-index">' + (cardIndex + 1) + '</div>' +
      '<div class="card-item-outer">' +
      '<div class="title">' + escapeHtml(card.title) + '</div>' +
      (contentHtml ? '<div class="content">' + contentHtml + '</div>' : '') +
      '</div>' +
      '</div>');
  }

  function getOthersValue(cardIndex) {
    var cardDom = getCardContainer(cardIndex);
    return cardDom.find('.others-outer input').val();
  }

  function toggleValideStatus(cardIndex, valid, isExportToExcelStr) {
    var cardDom = getCardContainer(cardIndex),
      requiredText = cardDom.find('.required-outer');

    var validateText = cardDom.find('.validate-outer');
    if (valid) {
      if(validateText) {
        validateText.addClass('hidden');
      }
      requiredText.addClass('hidden');
    } else {
      if(isExportToExcelStr) {
        requiredText.addClass('hidden');
        validateText.removeClass('hidden')
      } else {
        requiredText.removeClass('hidden');
      }
    }
  }

  return {
    transferChoices: transferChoices,
    getOthersHtml: getOthersHtml,
    getValidateHtml: getValidateHtml,
    getRequiredHtml: getRequiredHtml,
    getCardContainer: getCardContainer,
    getCardHtml: getCardHtml,
    getOthersValue: getOthersValue,
    toggleValideStatus: toggleValideStatus
  }
}

function useFormAuthController() {
  var formAuthUtil  = useFormAuthUtil()

  var SINGLE_CHOICE = 0,
      MULTIPLE_CHOICE = 1,
      COMBOBOX = 2,
      INPUT = 3,
      SCORE = 4,
      NOTE = 5;

  var CARD_MAP = {};
  CARD_MAP[SINGLE_CHOICE] = {
    render: function (card, cardIndex) {
      var choices = formAuthUtil.transferChoices(card);
      var options = '<div class="radio">';
      $.each(choices, function (index, choice) {
        options += ('<div class="choice-outer">' +
          '<label class="choice-item">' +
          '<input id="' + escapeHtml(card.title) + index + '" class="choice-input" type="radio" name="' + escapeHtml(card.title) + cardIndex + '" value="' + choice.value + '">' +
          '<span class="text">' + escapeHtml(choice.text) + '</span>' +
          '</label>' +
          '</div>');
      });
      options += '</div>';

      if (card.others) {
        options += formAuthUtil.getOthersHtml();
        options += formAuthUtil.getValidateHtml();
      }

      if (card.required) {
        options += formAuthUtil.getRequiredHtml('Please choose an answer.');
      }

      return formAuthUtil.getCardHtml(card, cardIndex, options);
    },
    getValue: function (card, cardIndex) {
      var cardDom = formAuthUtil.getCardContainer(cardIndex),
        checkbox = cardDom.find('input[type="radio"]'),
        othersVal = card.choices.length;

      var answer = {
        type: card.type
      };

      checkbox.each(function () {
        if ($(this).prop("checked")) {
          var val = parseInt($(this).val());
          if (val === othersVal) {
            answer.others = formAuthUtil.getOthersValue(cardIndex);
          } else {
            answer.choiceAnswer = [val];
          }
        }
      });

      return answer;
    },
    bindEvent: function (card, cardContainer) {
      var self = this,
        radios = cardContainer.find('input[type="radio"]');

      cardContainer.on('ev_valid', function () {
        self.validate(card, cardContainer.attr('card-index'));
      });

      radios.click(function () {
        cardContainer.trigger('ev_valid');
      });

      if (card.others) {
        var othersVal = card.choices.length,
          othersInput = cardContainer.find('.others-outer');

        radios.click(function () {
          if ($(this).prop("checked") && parseInt($(this).attr("value")) === othersVal) {
            othersInput.removeClass('hidden');
          } else {
            othersInput.addClass('hidden');
          }
        });
      }
    },
    validate: function (card, cardIndex) {
      var valid = !card.required,
        cardDom = formAuthUtil.getCardContainer(cardIndex);

      var radio = cardDom.find('input[type="radio"]:checked');
      var regex = /^[^+@=\-]/;

      if (radio.length > 0) {
        var isOthersRadio = parseInt(radio.val()) === card.choices.length;
        if(isOthersRadio && formAuthUtil.getOthersValue(cardIndex) && !regex.test(formAuthUtil.getOthersValue(cardIndex))) {
          formAuthUtil.toggleValideStatus(cardIndex, false, true);
          return false
        }

        if (card.required) {
          if(isOthersRadio && !formAuthUtil.getOthersValue(cardIndex)) {
            formAuthUtil.toggleValideStatus(cardIndex, false);
            return false
          }
        }
      } else {
        formAuthUtil.toggleValideStatus(cardIndex, valid);
        return valid
      }

      formAuthUtil.toggleValideStatus(cardIndex, true);
      return true;
    }
  };
  CARD_MAP[MULTIPLE_CHOICE] = {
    render: function (card, cardIndex) {
      var choices = formAuthUtil.transferChoices(card);
      var options = '<div class="checkbox">';
      $.each(choices, function (index, choice) {
        options += ('<div class="choice-outer">' +
          '<label class="choice-item">' +
          '<input id="' + escapeHtml(card.title) + index + '" class="choice-input" type="checkbox" name="' + escapeHtml(card.title) + cardIndex + '" value="' + choice.value + '">' +
          '<span class="text">' + escapeHtml(choice.text) + '</span>' +
          '</label>' +
          '</div>');
      });
      options += '</div>';

      if (card.others) {
        options += formAuthUtil.getOthersHtml();
        options += formAuthUtil.getValidateHtml();
      }

      if (card.required) {
        options += formAuthUtil.getRequiredHtml('Please choose an answer.');
      }

      return formAuthUtil.getCardHtml(card, cardIndex, options);
    },
    getValue: function (card, cardIndex) {
      var cardDom = formAuthUtil.getCardContainer(cardIndex),
        checkbox = cardDom.find('input[type="checkbox"]'),
        othersVal = card.choices.length;

      var answer = {
        type: card.type,
        choiceAnswer: []
      };

      checkbox.each(function () {
        if ($(this).prop("checked")) {
          var val = parseInt($(this).val());
          if (val === othersVal) {
            answer.others = formAuthUtil.getOthersValue(cardIndex);
          } else {
            answer.choiceAnswer.push(val);
          }
        }
      });

      return answer;
    },
    bindEvent: function (card, cardContainer) {
      var self = this,
        checkboxes = cardContainer.find('input[type="checkbox"]');

      cardContainer.on('ev_valid', function () {
        self.validate(card, cardContainer.attr('card-index'));
      });

      checkboxes.click(function () {
        cardContainer.trigger('ev_valid');
      });

      if (card.others) {
        var othersVal = card.choices.length,
          checkbox = checkboxes.filter('[value="' + othersVal + '"]'),
          othersInput = cardContainer.find('.others-outer');

        checkbox.click(function () {
          if ($(this).prop("checked")) {
            othersInput.removeClass('hidden');
          } else {
            othersInput.addClass('hidden');
          }
        });
      }
    },
    validate: function (card, cardIndex) {
      var valid = !card.required,
        cardDom = formAuthUtil.getCardContainer(cardIndex);

      var checkbox = cardDom.find('input[type="checkbox"]'),
        selected = [];
      var regex = /^[^+@=\-]/;

      if (card.required) {
        checkbox.each(function () {
          if ($(this).prop("checked")) {
            selected.push(parseInt($(this).val()));
          }
        });

        if (selected.length > 0) {
          var othersValue = card.choices.length,
            hasOthers = selected.indexOf(othersValue) !== -1;

          if(hasOthers && formAuthUtil.getOthersValue(cardIndex) && !regex.test(formAuthUtil.getOthersValue(cardIndex))) {
            formAuthUtil.toggleValideStatus(cardIndex, false, true);
            return false
          }

          if (card.required) {
            if(hasOthers && !formAuthUtil.getOthersValue(cardIndex)) {
              formAuthUtil.toggleValideStatus(cardIndex, false);
              return false
            }
          }
        } else {
          formAuthUtil.toggleValideStatus(cardIndex, valid);
          return valid
        }
      }

      formAuthUtil.toggleValideStatus(cardIndex, true);
      return true;
    }
  };
  CARD_MAP[COMBOBOX] = {
    render: function (card, cardIndex) {
      var choices = formAuthUtil.transferChoices(card);
      var options = '<select class="combobox">';
      $.each(choices, function (index, choice) {
        options += '<option value="' + choice.value + '">' + escapeHtml(choice.text) + '</option>';
      });
      options += '</select>'

      if (card.others) {
        options += formAuthUtil.getOthersHtml();
      }

      if (card.required) {
        options += formAuthUtil.getRequiredHtml('Please choose an answer.');
      }

      return formAuthUtil.getCardHtml(card, cardIndex, options);
    },
    getValue: function (card, cardIndex) {
      var cardDom = formAuthUtil.getCardContainer(cardIndex),
        selectVal = parseInt(cardDom.find('select').val());

      var answer = {
        type: card.type
      };

      if (selectVal === card.choices.length) {
        answer.others = formAuthUtil.getOthersValue(cardIndex);
      } else {
        answer.choiceAnswer = [selectVal];
      }
      return answer;
    },
    bindEvent: function (card, cardContainer) {
      if (card.others) {
        var othersVal = card.choices.length,
          combobox = cardContainer.find('select.combobox'),
          othersInput = cardContainer.find('.others-outer');

        combobox.on("change", function () {
          if (parseInt($(this).val()) === othersVal) {
            othersInput.removeClass('hidden');
          } else {
            othersInput.addClass('hidden');
          }
        });
      }
    },
    validate: function (card, cardIndex) {
      var valid = !card.required,
        cardDom = formAuthUtil.getCardContainer(cardIndex);

      if (card.required) {
        var selectValue = cardDom.find('select').val();
        if (selectValue) {
          var isOthersCombo = parseInt(selectValue) === card.choices.length;
          if (!isOthersCombo || formAuthUtil.getOthersValue(cardIndex)) {
            valid = true;
          }
        }
      }

      formAuthUtil.toggleValideStatus(cardIndex, valid);

      return valid;
    }
  };
  CARD_MAP[INPUT] = {
    render: function (card, cardIndex) {
      var html = '<input class="input" maxlength="'+MAX_INPUT_LEN+'"  type="text" />';

      html += formAuthUtil.getValidateHtml();
      if (card.required) {
        html += formAuthUtil.getRequiredHtml('Please Input');
      }

      return formAuthUtil.getCardHtml(card, cardIndex, html);
    },
    getValue: function (card, cardIndex) {
      var cardDom = formAuthUtil.getCardContainer(cardIndex),
        input = cardDom.find('input');

      return {
        type: card.type,
        inputAnswer: input.val()
      };
    },
    bindEvent: function (card, cardContainer) {
      var self = this,
        input = cardContainer.find('input');

      cardContainer.on('ev_valid', function () {
        self.validate(card, cardContainer.attr('card-index'));
      });

      input.on('focusout', function () {
        cardContainer.trigger('ev_valid');
      });
    },
    validate: function (card, cardIndex) {
      var valid = !card.required,
        cardDom = formAuthUtil.getCardContainer(cardIndex);
      var input = cardDom.find('.input');
      var regex = /^[^+@=\-]/
      var isExportToExcelStr = regex.test(input.val())

      if (card.required) {
        if(!input.val()) {
          formAuthUtil.toggleValideStatus(cardIndex, false);
          return false
        }
      }

      if(!isExportToExcelStr) {
        formAuthUtil.toggleValideStatus(cardIndex, false, true);
        return false
      }

      formAuthUtil.toggleValideStatus(cardIndex, true);
      return true;
    }
  };
  CARD_MAP[SCORE] = {
    render: function (card, cardIndex) {
      var html = '<div class="score-outer">';
      html += '<div class="score-wrapper">';
      for (var i = 1; i <= 5; i++) {
        html += '<div class="score-icon" score="' + i + '"></div>';
      }
      html += '</div>';
      html += '<div class="score-tip hidden"></div>';
      html += '<div class="score-comment">';
      html += '<div class="comment-icon-outer">';
      html += '<span class="icon"></span>';
      html += '<span class="text">Comments</span>';
      html += '</div>';
      html += '<textarea class="comment-area" maxlength="'+MAX_INPUT_LEN+'"></textarea>';
      html += '</div>';
      html += '</div>';

      if (card.required) {
        html += formAuthUtil.getRequiredHtml('Please give a rating.');
      }

      return formAuthUtil.getCardHtml(card, cardIndex, html);
    },
    getValue: function (card, cardIndex) {
      var cardDom = formAuthUtil.getCardContainer(cardIndex),
        score = cardDom.find('.score-icon.active'),
        answer = {
          type: card.type
        };

      if (score.length > 0) {
        answer.score = parseInt(score.last().attr('score'));
      }

      var commentDom = cardDom.find('.score-comment.active');
      if (commentDom.length > 0) {
        answer.inputAnswer = commentDom.find('textarea').val();
      }

      return answer;
    },
    bindEvent: function (card, cardContainer) {
      var scoreIcon = cardContainer.find('.score-icon'),
        scoreTip = cardContainer.find('.score-tip'),
        writeIcon = cardContainer.find('.comment-icon-outer'),
        self = this;

      cardContainer.on('ev_valid', function () {
        self.validate(card, cardContainer.attr('card-index'));
      });

      scoreIcon.click(function () {
        scoreIcon.removeClass('active');

        $(this).addClass('active')
          .prevAll().addClass('active');

        var index = $(this).attr('score') - 1;
        if (card.scoreNotes[index]) {
          scoreTip.text(card.scoreNotes[index]).removeClass('hidden');
        } else {
          scoreTip.text('').addClass('hidden');
        }

        cardContainer.trigger('ev_valid');
      });

      writeIcon.click(function () {
        writeIcon.parent().toggleClass('active');
      });
    },
    validate: function (card, cardIndex) {
      var valid = !card.required,
        cardDom = formAuthUtil.getCardContainer(cardIndex);

      if (card.required) {
        var scores = cardDom.find('.score-icon.active');
        if (scores.length > 0) {
          valid = true;
        }
      }

      formAuthUtil.toggleValideStatus(cardIndex, valid);

      return valid;
    }
  };
  CARD_MAP[NOTE] = {
    render: formAuthUtil.getCardHtml,
    getValue: function (card, cardIndex) {
      return {
        type: card.type
      };
    }
  };

  function init (config) {
    $("#access-title").html('');
    $("#button-login").html(globalConfig.formAuthButtonText);
    window.authType = FORM_AUTH_ACCESS_TYPE;
  }

  function showFormAuth (config) {
    renderFormTitle(config);
    var html = getCardsHtml(config);
    $('#form-auth-content').html(html);
    bindCardsEvent(config);
    $('#form-auth-msg').show();
  }

  function bindCardsEvent(globalConfig) {
    $('#form-auth-content .card-container').each(function () {
      var index = parseInt($(this).attr('card-index'));
      var card = globalConfig.formAuth.cardList[index];
      !!CARD_MAP[card.type].bindEvent && !!CARD_MAP[card.type].bindEvent(card, $(this));
    });
  }

  function renderFormTitle (globalConfig) {
    $('#form-auth-title').text(globalConfig.formAuth.title);
    $('#form-auth-note').text(globalConfig.formAuth.note);
  }

  function isFormAuthValid() {
    var cards = globalConfig.formAuth.cardList,
      valid = true;
    $.each(cards, function (index, card) {
      var validate = CARD_MAP[card.type].validate;
      if (validate && !validate(card, index)) {
        valid = false;
      }
    });

    return valid;
  }

  function getAuthData() {
    var answers = [];
    var cards = globalConfig.formAuth.cardList;

    $.each(cards, function (index, card) {
      if (CARD_MAP[card.type].getValue) {
        answers.push(CARD_MAP[card.type].getValue(card, index));
      }
    });

    return {
      formAuthId: globalConfig.formAuth.id,
      answers: answers
    };
  }

  function submitFormAuth(handleSubmit) {
    if ($("#form-auth-submit").hasClass("disabled")) return;
    if (isFormAuthValid()) {
      handleSubmit();
    }
  }

  function getCardsHtml(globalConfig) {
    var cards = globalConfig.formAuth.cardList,
      html = '';
    $.each(cards, function (i, card) {
      html += CARD_MAP[card.type].render(card, i);
    });
    return html;
  }

  return {
    init: init,
    isFormAuthValid: isFormAuthValid,
    getAuthData: getAuthData,
    showFormAuth: showFormAuth,
    submitFormAuth: submitFormAuth
  }
}

function escapeHtml(string) {
  if (string === null || string === undefined) {
    return "";
  }
  var r = string.toString();
  r = r.replace(/\&/g, "&amp;");
  r = r.replace(/\</g, "&lt;");
  r = r.replace(/\>/g, "&gt;");
  r = r.replace(/\"/g, "&quot;");
  r = r.replace(/\'/g, "&#39;");
  r = r.replace(/\s/g, "&nbsp;");
  return r;
};

function setNormalButton() {
    $("#button-login").html(globalConfig.buttonText);
}
